const MI_INT8 = 1;
const MI_INT32 = 5;
const MI_UINT32 = 6;
const MI_SINGLE = 7;
const MI_DOUBLE = 9;
const MI_MATRIX = 14;
const MI_UTF16 = 17;
const MX_CHAR_CLASS = 4;
const MX_DOUBLE_CLASS = 6;
const MX_SINGLE_CLASS = 7;
const COMPLEX_FLAG = 0x0800;

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function int32Bytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setInt32(index * 4, value, true));
  return bytes;
}

function uint32Bytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value, true));
  return bytes;
}

function float32Bytes(values: ArrayLike<number>): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) view.setFloat32(index * 4, values[index], true);
  return bytes;
}

function float64Bytes(values: ArrayLike<number>): Uint8Array {
  const bytes = new Uint8Array(values.length * 8);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) view.setFloat64(index * 8, values[index], true);
  return bytes;
}

function uint16Bytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint16(index * 2, value, true));
  return bytes;
}

function dataElement(type: number, payload: Uint8Array): Uint8Array {
  const padding = (8 - payload.length % 8) % 8;
  const output = new Uint8Array(8 + payload.length + padding);
  const view = new DataView(output.buffer);
  view.setUint32(0, type, true);
  view.setUint32(4, payload.length, true);
  output.set(payload, 8);
  return output;
}

function matrixElement(options: {
  name: string;
  dimensions: readonly number[];
  matlabClass: number;
  storageType: number;
  real: Uint8Array;
  imaginary?: Uint8Array;
}): Uint8Array {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(options.name)) throw new Error(`MATLAB 变量名无效：${options.name}`);
  if (options.dimensions.length < 2 || options.dimensions.some((value) => !Number.isInteger(value) || value < 0)) throw new Error("MATLAB 数组维度无效。");
  const flags = options.matlabClass | (options.imaginary ? COMPLEX_FLAG : 0);
  const inner = concatenate([
    dataElement(MI_UINT32, uint32Bytes([flags, 0])),
    dataElement(MI_INT32, int32Bytes(options.dimensions)),
    dataElement(MI_INT8, new TextEncoder().encode(options.name)),
    dataElement(options.storageType, options.real),
    ...(options.imaginary ? [dataElement(options.storageType, options.imaginary)] : []),
  ]);
  return dataElement(MI_MATRIX, inner);
}

export function matV5ComplexSingle(name: string, rows: number, columns: number, real: Float32Array, imaginary: Float32Array): Uint8Array {
  if (real.length !== rows * columns || imaginary.length !== real.length) throw new Error("MATLAB 复单精度矩阵尺寸不匹配。");
  return matrixElement({ name, dimensions: [rows, columns], matlabClass: MX_SINGLE_CLASS, storageType: MI_SINGLE, real: float32Bytes(real), imaginary: float32Bytes(imaginary) });
}

export function matV5Double(name: string, rows: number, columns: number, values: ArrayLike<number>): Uint8Array {
  if (values.length !== rows * columns) throw new Error("MATLAB 双精度矩阵尺寸不匹配。");
  return matrixElement({ name, dimensions: [rows, columns], matlabClass: MX_DOUBLE_CLASS, storageType: MI_DOUBLE, real: float64Bytes(values) });
}

export function matV5String(name: string, value: string): Uint8Array {
  const utf16 = Array.from({ length: value.length }, (_, index) => value.charCodeAt(index));
  return matrixElement({ name, dimensions: [1, utf16.length], matlabClass: MX_CHAR_CLASS, storageType: MI_UTF16, real: uint16Bytes(utf16) });
}

export function createMatFileV5(variables: readonly Uint8Array[], description = "SPACEDRONE SAR echo export"): ArrayBuffer {
  const header = new Uint8Array(128);
  header.fill(0x20, 0, 116);
  header.set(new TextEncoder().encode(`MATLAB 5.0 MAT-file, Platform: SPACEDRONE, Created by browser, ${description}`).slice(0, 116), 0);
  header.fill(0, 116, 124);
  header[124] = 0x00;
  header[125] = 0x01;
  header[126] = 0x49;
  header[127] = 0x4d;
  const file = concatenate([header, ...variables]);
  return file.buffer as ArrayBuffer;
}
