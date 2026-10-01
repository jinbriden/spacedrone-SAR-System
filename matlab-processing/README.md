# SPACEDRONE MATLAB 回波成像

运行 `process_spacedrone_sar_echo.m`，选择仿真平台通过“导出 MATLAB .mat”生成的回波文件。脚本完成：

1. LFM 匹配滤波距离压缩；
2. 基于 `slant_range_m` 的最近邻距离徙动校正；
3. 双程载波相位补偿；
4. 汉宁加权慢时间相干积累；
5. 原始回波、距离压缩结果、聚焦图像和峰值切片显示。

默认结果写入 `matlab-processing/output/`：

- `*-focused.mat`：聚焦复图像、坐标轴和质量指标；
- `*-focused.fig`：可交互 MATLAB 图窗；
- `*-focused.png`：成像结果图片。

可以在脚本顶部直接设置 `inputFile`。非交互批处理也支持环境变量：

```matlab
setenv("SPACEDRONE_MAT_INPUT", "D:\data\spacedrone-sar-echo.mat");
run("process_spacedrone_sar_echo.m");
```

导出的 `echo_iq` 布局必须为 `[快时间采样点 × 慢时间脉冲]`。如果平台启用了“按 PRI 折叠距离模糊”，图像距离轴表示表观斜距。
