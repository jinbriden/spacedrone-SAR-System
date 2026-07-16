/// <reference lib="webworker" />
import { computeTaskPlan, type TaskPlanningRequest } from "./taskPlanning";

interface WorkerRequest { id: number; request: TaskPlanningRequest }
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;
  try { self.postMessage({ id, result: computeTaskPlan(request) }); }
  catch (error) { self.postMessage({ id, error: error instanceof Error ? error.message : "任务规划失败。" }); }
};
export {};
