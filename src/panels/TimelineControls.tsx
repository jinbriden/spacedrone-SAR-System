import { Button, InputNumber, Select, Slider, Space, Typography } from "antd";
import { useSimulationStore } from "../stores/simulationStore";

const { Text } = Typography;
const playbackRates = [0.1, 1, 10, 100, 1000].map((value) => ({
  value,
  label: `${value}×`,
}));

export function TimelineControls() {
  const playing = useSimulationStore((state) => state.playing);
  const elapsedSeconds = useSimulationStore((state) => state.elapsedSeconds);
  const playbackRate = useSimulationStore((state) => state.playbackRate);
  const timelineSettings = useSimulationStore((state) => state.timelineSettings);
  const setPlaying = useSimulationStore((state) => state.setPlaying);
  const setPlaybackRate = useSimulationStore((state) => state.setPlaybackRate);
  const setElapsedSeconds = useSimulationStore((state) => state.setElapsedSeconds);
  const updateTimelineSettings = useSimulationStore((state) => state.updateTimelineSettings);
  const step = useSimulationStore((state) => state.step);
  const reset = useSimulationStore((state) => state.reset);

  return (
    <footer className="timeline">
      <Space wrap className="timeline-controls">
        <Button onClick={reset}>重置</Button>
        <Button onClick={() => step(-1)} disabled={playing || elapsedSeconds <= timelineSettings.startSeconds}>
          −1 s
        </Button>
        <Button type="primary" onClick={() => setPlaying(!playing)}>
          {playing ? "暂停" : "播放"}
        </Button>
        <Button onClick={() => step(1)} disabled={playing}>
          +1 s
        </Button>
        <Select
          aria-label="仿真倍率"
          value={playbackRate}
          options={playbackRates}
          onChange={setPlaybackRate}
        />
        <Text className="elapsed-time">T + {elapsedSeconds.toFixed(1)} s</Text>
      </Space>
      <div className="timeline-scrubber">
        <Slider
          min={timelineSettings.startSeconds}
          max={timelineSettings.endSeconds}
          step={0.1}
          value={elapsedSeconds}
          tooltip={{ formatter: (value) => `T + ${value?.toFixed(1)} s` }}
          onChangeComplete={setElapsedSeconds}
        />
      </div>
      <Space.Compact size="small" className="timeline-range-inputs">
        <span className="timeline-input-label">起</span>
        <InputNumber
          aria-label="仿真起始时间"
          min={0}
          max={timelineSettings.endSeconds - 1}
          value={timelineSettings.startSeconds}
          onChange={(value) => value !== null && updateTimelineSettings({ startSeconds: value })}
        />
        <span className="timeline-input-label">当前</span>
        <InputNumber
          aria-label="当前仿真时间"
          min={timelineSettings.startSeconds}
          max={timelineSettings.endSeconds}
          value={Number(elapsedSeconds.toFixed(1))}
          onChange={(value) => value !== null && setElapsedSeconds(value)}
        />
        <span className="timeline-input-label">止</span>
        <InputNumber
          aria-label="仿真结束时间"
          min={timelineSettings.startSeconds + 1}
          max={315576000}
          value={timelineSettings.endSeconds}
          onChange={(value) => value !== null && updateTimelineSettings({ endSeconds: value })}
        />
      </Space.Compact>
    </footer>
  );
}
