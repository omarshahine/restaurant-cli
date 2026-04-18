import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "bin/restaurant.ts",
    "src/index.ts",
    "src/providers/index.ts",
    "src/scheduler/index.ts",
    "src/core/index.ts",
    "src/integrations/openclaw/index.ts",
    "src/integrations/openclaw/adapter.ts",
  ],
  format: ["esm"],
  outDir: "dist",
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  splitting: false,
  shims: false,
  skipNodeModulesBundle: true,
});
