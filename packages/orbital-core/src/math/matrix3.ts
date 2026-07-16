import type { Matrix3, Vector3 } from "../types";

export const IDENTITY_MATRIX_3: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function multiplyMatrixVector(matrix: Matrix3, vector: Vector3): Vector3 {
  return [
    matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
    matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
    matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
  ];
}

export function multiplyMatrices(left: Matrix3, right: Matrix3): Matrix3 {
  const result = Array.from({ length: 9 }, () => 0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      result[row * 3 + column] =
        left[row * 3] * right[column] +
        left[row * 3 + 1] * right[3 + column] +
        left[row * 3 + 2] * right[6 + column];
    }
  }
  return result as unknown as Matrix3;
}

export function transposeMatrix(matrix: Matrix3): Matrix3 {
  return [
    matrix[0], matrix[3], matrix[6],
    matrix[1], matrix[4], matrix[7],
    matrix[2], matrix[5], matrix[8],
  ];
}

/** Creates a row-major matrix whose columns are the parent-frame basis axes. */
export function matrixFromColumns(x: Vector3, y: Vector3, z: Vector3): Matrix3 {
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}

export function rotationX(angleRad: number): Matrix3 {
  const cosine = Math.cos(angleRad);
  const sine = Math.sin(angleRad);
  return [1, 0, 0, 0, cosine, -sine, 0, sine, cosine];
}

export function rotationY(angleRad: number): Matrix3 {
  const cosine = Math.cos(angleRad);
  const sine = Math.sin(angleRad);
  return [cosine, 0, sine, 0, 1, 0, -sine, 0, cosine];
}

export function rotationZ(angleRad: number): Matrix3 {
  const cosine = Math.cos(angleRad);
  const sine = Math.sin(angleRad);
  return [cosine, -sine, 0, sine, cosine, 0, 0, 0, 1];
}

/** Returns Rz(yaw) Ry(pitch) Rx(roll), using active right-hand rotations. */
export function eulerZyxMatrix(
  rollRad: number,
  pitchRad: number,
  yawRad: number,
): Matrix3 {
  return multiplyMatrices(
    multiplyMatrices(rotationZ(yawRad), rotationY(pitchRad)),
    rotationX(rollRad),
  );
}
