%% SPACEDRONE 导出回波的 MATLAB 成像处理
% 处理流程与仿真平台的参考算法保持一致：
%   1. LFM 匹配滤波距离压缩；
%   2. 根据逐脉冲真实斜距历程进行最近邻距离徙动校正（RCMC）；
%   3. 双程载波相位补偿；
%   4. 汉宁加权慢时间相干积累，形成距离-方位二维图像。
%
% 使用方法：
%   - 直接运行本脚本，在文件选择窗口中选择平台导出的 .mat 文件；或
%   - 将 inputFile 设置为导出文件的完整路径；或
%   - 批处理时设置环境变量 SPACEDRONE_MAT_INPUT。

% 本文件是普通脚本，常用参数集中在下方；局部辅助函数位于文件末尾。

clear;
clc;
close all;

%% 用户参数
inputFile = "";                 % 留空时自动查找本目录文件，否则弹出选择窗口
maximumRangePixels = 512;       % 聚焦图像最多保留的距离向像素数
displayDynamicRangeDb = 60;     % 图像显示动态范围（dB）
cutUpsampleFactor = 8;         % 峰值切片绘图的 FFT 插值倍数（1 表示不升采样）
saveResults = true;             % 保存 result.mat、PNG 和 FIG

%% 定位输入文件和输出目录
scriptDirectory = fileparts(mfilename("fullpath"));
environmentInput = string(getenv("SPACEDRONE_MAT_INPUT"));
if strlength(inputFile) == 0 && strlength(environmentInput) > 0
    inputFile = environmentInput;
end

if strlength(inputFile) == 0
    candidates = dir(fullfile(scriptDirectory, "spacedrone-sar-echo-*.mat"));
    if ~isempty(candidates)
        [~, newestIndex] = max([candidates.datenum]);
        inputFile = string(fullfile(candidates(newestIndex).folder, candidates(newestIndex).name));
        fprintf("自动选择最新回波文件：%s\n", inputFile);
    else
        [fileName, filePath] = uigetfile({"*.mat", "MATLAB 回波文件 (*.mat)"}, ...
            "选择 SPACEDRONE 导出的回波文件", scriptDirectory);
        if isequal(fileName, 0)
            error("SPACEDRONE:NoInput", "未选择回波文件，处理已取消。");
        end
        inputFile = string(fullfile(filePath, fileName));
    end
end

if ~isfile(inputFile)
    error("SPACEDRONE:InputNotFound", "找不到回波文件：%s", inputFile);
end

environmentOutput = string(getenv("SPACEDRONE_OUTPUT_DIR"));
if strlength(environmentOutput) > 0
    outputDirectory = environmentOutput;
else
    outputDirectory = string(fullfile(scriptDirectory, "output"));
end
if ~isfolder(outputDirectory)
    mkdir(outputDirectory);
end

%% 读取并检查平台导出的数据
data = load(inputFile);
requiredFields = ["echo_iq", "fast_time_s", "slow_time_s", "slant_range_m", ...
    "carrier_frequency_hz", "wavelength_m", "chirp_bandwidth_hz", ...
    "pulse_width_s", "chirp_rate_hz_per_s", "prf_hz", "sampling_rate_hz"];
requireFields(data, requiredFields);

echoIq = data.echo_iq;
fastTimeSeconds = double(data.fast_time_s(:));
slowTimeSeconds = double(data.slow_time_s(:));
slantRangeM = double(data.slant_range_m(:));

if ~isnumeric(echoIq) || isreal(echoIq)
    error("SPACEDRONE:InvalidEcho", "echo_iq 必须是复数矩阵。");
end
[fastTimeSampleCount, pulseCount] = size(echoIq);
if fastTimeSampleCount ~= numel(fastTimeSeconds) || ...
        pulseCount ~= numel(slowTimeSeconds) || pulseCount ~= numel(slantRangeM)
    error("SPACEDRONE:DimensionMismatch", ...
        "echo_iq 必须采用 [快时间采样点 × 慢时间脉冲] 布局，且与时间轴和斜距历程长度一致。");
end
if fastTimeSampleCount < 2 || pulseCount < 2
    error("SPACEDRONE:InsufficientSamples", "成像至少需要 2 个快时间采样点和 2 个脉冲。");
end
if any(~isfinite(real(echoIq(:)))) || any(~isfinite(imag(echoIq(:)))) || ...
        any(~isfinite(fastTimeSeconds)) || any(~isfinite(slowTimeSeconds)) || ...
        any(~isfinite(slantRangeM))
    error("SPACEDRONE:NonFiniteData", "导出数据中包含 NaN 或 Inf。");
end
if any(diff(fastTimeSeconds) <= 0) || any(diff(slowTimeSeconds) <= 0)
    error("SPACEDRONE:InvalidAxis", "快时间和慢时间轴必须严格递增。");
end

carrierFrequencyHz = scalarField(data, "carrier_frequency_hz");
wavelengthM = scalarField(data, "wavelength_m");
chirpBandwidthHz = scalarField(data, "chirp_bandwidth_hz");
pulseWidthSeconds = scalarField(data, "pulse_width_s");
chirpRateHzPerSecond = scalarField(data, "chirp_rate_hz_per_s");
prfHz = scalarField(data, "prf_hz");
samplingRateHz = scalarField(data, "sampling_rate_hz");
targetName = textField(data, "target_name", "未命名目标");
targetId = textField(data, "target_id", "unknown");
foldedRangeAmbiguity = logical(round(optionalScalarField(data, "folded_range_ambiguity", 0)));

fastTimeStepSeconds = median(diff(fastTimeSeconds));
slowTimeStepSeconds = median(diff(slowTimeSeconds));
if abs(fastTimeStepSeconds * samplingRateHz - 1) > 1e-5
    warning("SPACEDRONE:SamplingRateMismatch", ...
        "fast_time_s 的采样间隔与 sampling_rate_hz 略有差异，将采用实际时间轴间隔。");
end
if abs(slowTimeStepSeconds * prfHz - 1) > 1e-5
    warning("SPACEDRONE:PrfMismatch", ...
        "slow_time_s 的采样间隔与 prf_hz 略有差异，将采用实际慢时间轴。");
end

fprintf("\nSPACEDRONE SAR 回波成像\n");
fprintf("  输入文件：%s\n", inputFile);
fprintf("  目标：%s（%s）\n", targetName, targetId);
fprintf("  回波尺寸：%d 快时间点 × %d 脉冲\n", fastTimeSampleCount, pulseCount);
fprintf("  载频 / 带宽：%.6f GHz / %.3f MHz\n", carrierFrequencyHz / 1e9, chirpBandwidthHz / 1e6);
fprintf("  采样率 / PRF：%.3f MHz / %.3f Hz\n", samplingRateHz / 1e6, prfHz);

%% 第一步：LFM 匹配滤波距离压缩
chirpSampleCount = max(2, round(pulseWidthSeconds / fastTimeStepSeconds) + 1);
fftSize = 2 ^ nextpow2(fastTimeSampleCount + chirpSampleCount - 1);
if fftSize > 131072
    error("SPACEDRONE:FftTooLarge", ...
        "距离压缩 FFT 长度为 %d，超过参考流程上限 131072。请降低采样率、脉宽或快时间窗。", fftSize);
end

chirpCenter = (chirpSampleCount - 1) / 2;
reversedTime = (chirpCenter - (0:chirpSampleCount - 1)) * fastTimeStepSeconds;
matchedFilter = exp(-1i * pi * chirpRateHzPerSecond * reversedTime .^ 2).';
filterSpectrum = fft(matchedFilter, fftSize, 1);
compressedFull = ifft(fft(echoIq, fftSize, 1) .* filterSpectrum, [], 1);
convolutionOffset = chirpSampleCount - 1 - floor(chirpCenter);
rangeCompressed = compressedFull(convolutionOffset + (1:fastTimeSampleCount), :);

[~, globalPeakLinearIndex] = max(abs(rangeCompressed(:)) .^ 2);
[globalPeakFastIndex, ~] = ind2sub(size(rangeCompressed), globalPeakLinearIndex);

%% 第二至四步：RCMC、双程相位补偿和方位相干积累
rangePixelCount = min(maximumRangePixels, fastTimeSampleCount);
rangeStartIndex = max(1, min(fastTimeSampleCount - rangePixelCount + 1, ...
    globalPeakFastIndex - floor(rangePixelCount / 2)));
baseFastIndexZero = (rangeStartIndex - 1 + (0:rangePixelCount - 1)).';

centerAzimuthIndexZero = floor(pulseCount / 2);
centerRangeM = slantRangeM(centerAzimuthIndexZero + 1);
if pulseCount == 2
    azimuthWindow = ones(pulseCount, 1);
else
    azimuthWindow = 0.5 - 0.5 * cos(2 * pi * (0:pulseCount - 1).' / (pulseCount - 1));
end

speedOfLightMps = 299792458;
focusedComplex = complex(zeros(rangePixelCount, pulseCount));
for azimuthIndexZero = 0:pulseCount - 1
    shift = azimuthIndexZero - centerAzimuthIndexZero;
    pulseIndexZero = (0:pulseCount - 1).';
    referenceIndexZero = pulseIndexZero - shift;
    validReference = referenceIndexZero >= 0 & referenceIndexZero < pulseCount;
    pulseIndexZero = pulseIndexZero(validReference);
    referenceIndexZero = referenceIndexZero(validReference);

    migrationSeconds = 2 * (slantRangeM(referenceIndexZero + 1) - centerRangeM) / speedOfLightMps;
    migrationSamples = round(migrationSeconds / fastTimeStepSeconds);
    migratedFastIndexZero = baseFastIndexZero + migrationSamples.';
    validFastIndex = migratedFastIndexZero >= 0 & migratedFastIndexZero < fastTimeSampleCount;
    safeFastIndexZero = min(max(migratedFastIndexZero, 0), fastTimeSampleCount - 1);
    linearIndex = safeFastIndexZero + 1 + pulseIndexZero.' * fastTimeSampleCount;
    alignedSamples = rangeCompressed(linearIndex);
    alignedSamples(~validFastIndex) = 0;

    carrierPhase = 4 * pi * slantRangeM(referenceIndexZero + 1) / wavelengthM;
    coherentWeight = (azimuthWindow(pulseIndexZero + 1) .* exp(1i * carrierPhase)).';
    weightSum = sum(azimuthWindow(pulseIndexZero + 1));
    if weightSum > 0
        focusedComplex(:, azimuthIndexZero + 1) = sum(alignedSamples .* coherentWeight, 2) / weightSum;
    end
end

focusedPower = abs(focusedComplex) .^ 2;
[peakPower, peakLinearIndex] = max(focusedPower(:));
[peakRangeIndex, peakAzimuthIndex] = ind2sub(size(focusedPower), peakLinearIndex);
focusedDb = 10 * log10(max(focusedPower, realmin("double")) / max(peakPower, realmin("double")));
focusedDb = max(focusedDb, -displayDynamicRangeDb);

selectedFastIndices = rangeStartIndex + (0:rangePixelCount - 1);
apparentRangeM = fastTimeSeconds(selectedFastIndices) * speedOfLightMps / 2;
slowTimeOffsetSeconds = slowTimeSeconds - slowTimeSeconds(centerAzimuthIndexZero + 1);
azimuthCutPower = focusedPower(peakRangeIndex, :);
rangeCutPower = focusedPower(:, peakAzimuthIndex);
azimuthPslrDb = calculatePslrDb(azimuthCutPower, peakAzimuthIndex);
rangePslrDb = calculatePslrDb(rangeCutPower, peakRangeIndex);
azimuthWidthSeconds = halfPowerWidth(azimuthCutPower, peakAzimuthIndex) * slowTimeStepSeconds;
rangeSampleSpacingM = speedOfLightMps * fastTimeStepSeconds / 2;
rangeWidthM = halfPowerWidth(rangeCutPower, peakRangeIndex) * rangeSampleSpacingM;

fprintf("  聚焦峰值：方位偏移 %.6f s，表观斜距 %.3f km\n", ...
    slowTimeOffsetSeconds(peakAzimuthIndex), apparentRangeM(peakRangeIndex) / 1000);
fprintf("  方位 / 距离 PSLR：%.2f dB / %.2f dB\n", azimuthPslrDb, rangePslrDb);
fprintf("  方位 3 dB 时间宽度 / 距离 3 dB 宽度：%.6g s / %.3f m\n", ...
    azimuthWidthSeconds, rangeWidthM);
if foldedRangeAmbiguity
    fprintf("  注意：输入启用了 PRI 距离折叠，距离轴表示表观斜距。\n");
end

%% 绘制原始回波、距离压缩和聚焦结果
rawDb = normalizedMagnitudeDb(echoIq, displayDynamicRangeDb);
compressedDb = normalizedMagnitudeDb(rangeCompressed, displayDynamicRangeDb);
figureHandle = figure("Color", "w", "Name", "SPACEDRONE SAR 成像结果", ...
    "NumberTitle", "off", "Position", [80, 80, 1450, 850]);
layout = tiledlayout(2, 2, "TileSpacing", "compact", "Padding", "compact");

nexttile;
imagesc(slowTimeOffsetSeconds, fastTimeSeconds * 1e3, rawDb);
axis xy;
xlabel("相对慢时间 (s)");
ylabel("快时间 (ms)");
title("原始 LFM 复回波幅度 (dB)");
colorbar;
caxis([-displayDynamicRangeDb, 0]);

nexttile;
imagesc(slowTimeOffsetSeconds, fastTimeSeconds * speedOfLightMps / 2 / 1000, compressedDb);
axis xy;
xlabel("相对慢时间 (s)");
ylabel("表观斜距 (km)");
title("距离压缩结果 (dB)");
colorbar;
caxis([-displayDynamicRangeDb, 0]);

nexttile;
imagesc(slowTimeOffsetSeconds, apparentRangeM / 1000, focusedDb);
axis xy;
xlabel("方位时间偏移 (s)");
ylabel("表观斜距 (km)");
title("RCMC 与相位补偿后的聚焦图像 (dB)");
colorbar;
caxis([-displayDynamicRangeDb, 0]);
hold on;
plot(slowTimeOffsetSeconds(peakAzimuthIndex), apparentRangeM(peakRangeIndex) / 1000, ...
    "wo", "MarkerSize", 8, "LineWidth", 1.5);
hold off;

nexttile;
plot(slowTimeOffsetSeconds, normalizedPowerDb(azimuthCutPower, displayDynamicRangeDb), ...
    "LineWidth", 1.4, "DisplayName", "方位切片");
hold on;
rangeOffsetM = apparentRangeM - apparentRangeM(peakRangeIndex);
rangeCutPowerUpsampled = fftUpsample1d(rangeCutPower, cutUpsampleFactor);
rangeOffsetUpsampledM = linspace(rangeOffsetM(1), rangeOffsetM(end), ...
    numel(rangeCutPowerUpsampled)).';
if numel(rangeOffsetUpsampledM) ~= numel(rangeCutPowerUpsampled)
    error("SPACEDRONE:UpsampledPlotSizeMismatch", ...
        "升采样距离坐标有 %d 点，但距离切片有 %d 点。", ...
        numel(rangeOffsetUpsampledM), numel(rangeCutPowerUpsampled));
end
plot(rangeOffsetUpsampledM / max(rangeSampleSpacingM, eps) * slowTimeStepSeconds, ...
    normalizedPowerDb(rangeCutPowerUpsampled, displayDynamicRangeDb), ...
    "LineWidth", 1.4, "DisplayName", "距离切片（等效横轴）");
yline(-3, "--", "-3 dB");
hold off;
grid on;
xlabel("方位时间 / 距离采样等效偏移");
ylabel("归一化功率 (dB)");
title("峰值方位与距离切片");
legend("Location", "best");
ylim([-displayDynamicRangeDb, 3]);

colormap(layout, turbo(256));
sgtitle(layout, sprintf("SPACEDRONE 回波成像：%s", targetName), "Interpreter", "none");
drawnow;

%% 保存结果
result = struct();
result.sourceFile = char(inputFile);
result.targetId = char(targetId);
result.targetName = char(targetName);
result.algorithm = "LFM 距离压缩 + 真实斜距 RCMC + 双程相位补偿 + 慢时间相干积累";
result.focusedComplex = focusedComplex;
result.focusedDb = focusedDb;
result.rangeCompressed = rangeCompressed;
result.apparentRangeM = apparentRangeM;
result.slowTimeOffsetSeconds = slowTimeOffsetSeconds;
result.peakRangeIndex = peakRangeIndex;
result.peakAzimuthIndex = peakAzimuthIndex;
result.peakPower = peakPower;
result.azimuthPslrDb = azimuthPslrDb;
result.rangePslrDb = rangePslrDb;
result.azimuthWidthSeconds = azimuthWidthSeconds;
result.rangeWidthM = rangeWidthM;
result.foldedRangeAmbiguity = foldedRangeAmbiguity;
result.carrierFrequencyHz = carrierFrequencyHz;
result.wavelengthM = wavelengthM;
result.chirpBandwidthHz = chirpBandwidthHz;
result.pulseWidthSeconds = pulseWidthSeconds;
result.prfHz = prfHz;
result.samplingRateHz = samplingRateHz;

if saveResults
    [~, inputBaseName] = fileparts(inputFile);
    outputBaseName = inputBaseName + "-focused";
    resultFile = fullfile(outputDirectory, outputBaseName + ".mat");
    figureFile = fullfile(outputDirectory, outputBaseName + ".fig");
    imageFile = fullfile(outputDirectory, outputBaseName + ".png");
    save(resultFile, "result", "-v7.3");
    savefig(figureHandle, figureFile);
    exportgraphics(figureHandle, imageFile, "Resolution", 180);
    fprintf("  结果 MAT：%s\n", resultFile);
    fprintf("  结果 FIG：%s\n", figureFile);
    fprintf("  结果 PNG：%s\n", imageFile);
end
fprintf("处理完成。\n\n");

%% 局部辅助函数
function requireFields(data, fieldNames)
for index = 1:numel(fieldNames)
    if ~isfield(data, fieldNames(index))
        error("SPACEDRONE:MissingField", "导出文件缺少必要变量：%s", fieldNames(index));
    end
end
end

function value = scalarField(data, fieldName)
value = optionalScalarField(data, fieldName, NaN);
if ~isfinite(value)
    error("SPACEDRONE:InvalidScalar", "变量 %s 必须是有限标量。", fieldName);
end
end

function value = optionalScalarField(data, fieldName, defaultValue)
if ~isfield(data, fieldName)
    value = defaultValue;
    return;
end
rawValue = data.(fieldName);
if ~isnumeric(rawValue) && ~islogical(rawValue) || numel(rawValue) ~= 1
    error("SPACEDRONE:InvalidScalar", "变量 %s 必须是数值标量。", fieldName);
end
value = double(rawValue);
end

function value = textField(data, fieldName, defaultValue)
if ~isfield(data, fieldName)
    value = string(defaultValue);
    return;
end
value = string(data.(fieldName));
value = join(value(:), "");
if strlength(value) == 0
    value = string(defaultValue);
end
end

function valuesDb = normalizedMagnitudeDb(values, dynamicRangeDb)
powerValues = abs(values) .^ 2;
valuesDb = normalizedPowerDb(powerValues, dynamicRangeDb);
end

function valuesDb = normalizedPowerDb(powerValues, dynamicRangeDb)
peak = max(powerValues(:));
valuesDb = 10 * log10(max(double(powerValues), realmin("double")) / max(double(peak), realmin("double")));
valuesDb = max(valuesDb, -dynamicRangeDb);
end

function pslrDb = calculatePslrDb(values, peakIndex)
values = double(values(:));
peak = values(peakIndex);
mask = true(size(values));
mask(max(1, peakIndex - 1):min(numel(values), peakIndex + 1)) = false;
sidelobe = max(values(mask), [], "omitmissing");
if isempty(sidelobe) || peak <= 0 || sidelobe <= 0
    pslrDb = -Inf;
else
    pslrDb = 10 * log10(sidelobe / peak);
end
end

function widthSamples = halfPowerWidth(values, peakIndex)
values = double(values(:));
threshold = values(peakIndex) / 2;
lowerIndex = peakIndex;
upperIndex = peakIndex;
while lowerIndex > 1 && values(lowerIndex - 1) >= threshold
    lowerIndex = lowerIndex - 1;
end
while upperIndex < numel(values) && values(upperIndex + 1) >= threshold
    upperIndex = upperIndex + 1;
end
widthSamples = upperIndex - lowerIndex + 1;
end


%% 一维 FFT 升采样
function upsampled = fftUpsample1d(data, factor)
if ~isscalar(factor) || factor < 1 || factor ~= round(factor)
    error("SPACEDRONE:InvalidUpsampleFactor", "升采样倍数必须是正整数。");
end
wasRowVector = isrow(data);
dataColumn = data(:);
if factor == 1 || numel(dataColumn) < 2
    upsampled = dataColumn;
else
    % interpft 在数据所在的第一维进行频谱补零。仅保留首末原始采样点之间的区间，
    % 因而输出点数为 (N-1)*factor+1，原始样点每隔 factor 点严格对齐。
    periodicInterpolation = interpft(dataColumn, numel(dataColumn) * factor, 1);
    outputCount = (numel(dataColumn) - 1) * factor + 1;
    upsampled = periodicInterpolation(1:outputCount);
end
if isreal(data)
    upsampled = real(upsampled);
    % 功率理论上非负，消除 FFT 数值误差产生的极小负值。
    upsampled = max(upsampled, 0);
end
if wasRowVector
    upsampled = upsampled.';
end
end
