import { describe, expect, it } from "vitest";
import { isGltfFileName } from "./modelFile";

describe("isGltfFileName", () => {
  it("接受 glTF / GLB 扩展名", () => {
    expect(isGltfFileName("sat.glb")).toBe(true);
    expect(isGltfFileName("Sat.GLTF")).toBe(true);
  });

  it("拒绝无扩展名或错误扩展名，也不把反斜杠当成点", () => {
    expect(isGltfFileName("sat.bin")).toBe(false);
    expect(isGltfFileName("sat")).toBe(false);
    expect(isGltfFileName("folder\\glb")).toBe(false);
  });
});
