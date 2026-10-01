/** Resolves a file under /public for both Vite dev (`/`) and relative production `base`. */
export function publicAssetUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const trimmed = relativePath.replace(/^\/+/, "");
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${trimmed}`;
}
