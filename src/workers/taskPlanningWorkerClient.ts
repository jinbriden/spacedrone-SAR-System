import type { TaskPlanningRequest, TaskPlanningResult } from "./taskPlanning";

let nextTaskPlanningRequestId = 1;
export function runTaskPlanningWorker(request: TaskPlanningRequest): Promise<TaskPlanningResult> {
  return new Promise((resolve, reject) => {
    const id = nextTaskPlanningRequestId++;
    const worker = new Worker(new URL("./taskPlanning.worker.ts", import.meta.url), { type: "module", name: "spacedrone-task-planning" });
    const cleanup = () => worker.terminate();
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "无法启动任务规划 Worker。")); };
    worker.onmessage = (event: MessageEvent<{ id: number; result?: TaskPlanningResult; error?: string }>) => {
      if (event.data.id !== id) return;
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.result) resolve(event.data.result);
      else reject(new Error("任务规划 Worker 返回了无效结果。"));
    };
    worker.postMessage({ id, request });
  });
}
