import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createMatFileV5, matV5ComplexSingle, matV5Double, matV5String } from "./matFileV5";

const paddedElementLength = (payloadLength: number) => 8 + payloadLength + (8 - payloadLength % 8) % 8;

describe("MATLAB Level-5 writer", () => {
  it("生成 MATLAB 可识别的复单精度矩阵、双精度向量和字符串", () => {
    const buffer = createMatFileV5([
      matV5ComplexSingle("echo_iq", 2, 2, new Float32Array([1, 2, 3, 4]), new Float32Array([-1, -2, -3, -4])),
      matV5Double("fast_time_s", 2, 1, new Float64Array([0.1, 0.2])),
      matV5String("target_name", "目标 A"),
    ]);
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    expect(new TextDecoder().decode(bytes.slice(0, 19))).toBe("MATLAB 5.0 MAT-file");
    expect(new TextDecoder().decode(bytes.slice(126, 128))).toBe("IM");
    expect(view.getUint32(128, true)).toBe(14);

    const matrixStart = 136;
    expect(view.getUint32(matrixStart, true)).toBe(6);
    expect(view.getUint32(matrixStart + 8, true) & 0x0800).toBe(0x0800);
    const dimensionsStart = matrixStart + paddedElementLength(8);
    expect(view.getInt32(dimensionsStart + 8, true)).toBe(2);
    expect(view.getInt32(dimensionsStart + 12, true)).toBe(2);
    const nameStart = dimensionsStart + paddedElementLength(8);
    const nameLength = view.getUint32(nameStart + 4, true);
    expect(new TextDecoder().decode(bytes.slice(nameStart + 8, nameStart + 8 + nameLength))).toBe("echo_iq");
    const realStart = nameStart + paddedElementLength(nameLength);
    expect(view.getFloat32(realStart + 8, true)).toBe(1);
    const imaginaryStart = realStart + paddedElementLength(16);
    expect(view.getFloat32(imaginaryStart + 8, true)).toBe(-1);

    const output = process.env.SPACEDRONE_MAT_OUTPUT;
    if (output) writeFileSync(output, bytes);
  });
});
