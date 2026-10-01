export const WORKSPACE_MODES = [
  { id: "orbit", label: "轨道", hint: "轨道与多星编队" },
  { id: "attitude", label: "姿态", hint: "姿态、天线与阵列馈源" },
  { id: "targets", label: "目标", hint: "地面目标与数字高程" },
  { id: "mission", label: "任务", hint: "覆盖预览、重访与任务规划" },
  { id: "sar", label: "SAR", hint: "快慢时间、回波与成像" },
  { id: "display", label: "显示", hint: "图层、底图与卫星模型" },
] as const;

export type WorkspaceModeId = (typeof WORKSPACE_MODES)[number]["id"];

export const DEFAULT_WORKSPACE_MODE: WorkspaceModeId = "orbit";

export function isWorkspaceModeId(value: string): value is WorkspaceModeId {
  return WORKSPACE_MODES.some((mode) => mode.id === value);
}

export function workspaceModeById(value: string): (typeof WORKSPACE_MODES)[number] {
  const mode = WORKSPACE_MODES.find((item) => item.id === value);
  if (!mode) throw new Error(`未知工作区：${value}`);
  return mode;
}
