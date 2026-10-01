export function isGltfFileName(fileName: string): boolean {
  return /\.(gltf|glb)$/i.test(fileName);
}
