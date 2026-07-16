import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), cesium()],
  resolve: {
    alias: {
      "@spacedrone/orbital-core": fileURLToPath(
        new URL("./packages/orbital-core/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "src/**/*.test.ts"],
  },
});
