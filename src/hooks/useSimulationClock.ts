import { useEffect } from "react";
import { useSimulationStore } from "../stores/simulationStore";

export function useSimulationClock(): void {
  const playing = useSimulationStore((state) => state.playing);
  const advanceByRealTime = useSimulationStore(
    (state) => state.advanceByRealTime,
  );

  useEffect(() => {
    if (!playing) return;

    let animationFrame = 0;
    let previousTimestampMs = performance.now();
    const animate = (timestampMs: number) => {
      const realDeltaSeconds = Math.max(
        0,
        Math.min((timestampMs - previousTimestampMs) / 1000, 0.25),
      );
      previousTimestampMs = timestampMs;
      advanceByRealTime(realDeltaSeconds);
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [advanceByRealTime, playing]);
}
