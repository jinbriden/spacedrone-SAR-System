import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_MODE,
  WORKSPACE_MODES,
  isWorkspaceModeId,
  workspaceModeById,
} from "./modes";

describe("workspace modes", () => {
  it("默认落在轨道工作区，且六个模式 id 唯一", () => {
    expect(DEFAULT_WORKSPACE_MODE).toBe("orbit");
    expect(WORKSPACE_MODES.map((mode) => mode.id)).toEqual([
      "orbit",
      "attitude",
      "targets",
      "mission",
      "sar",
      "display",
    ]);
    expect(new Set(WORKSPACE_MODES.map((mode) => mode.id)).size).toBe(WORKSPACE_MODES.length);
  });

  it("校验并解析工作区 id", () => {
    expect(isWorkspaceModeId("sar")).toBe(true);
    expect(isWorkspaceModeId("unknown")).toBe(false);
    expect(workspaceModeById("targets").label).toBe("目标");
    expect(() => workspaceModeById("nope")).toThrow(/未知工作区/);
  });
});
