import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["bin/**/*.ts", "src/**/*.ts"],
  format: ["esm"],
  outDir: "dist",
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  splitting: false,
  shims: false,
  skipNodeModulesBundle: true,
  // Compile each TS file to its own JS file rather than bundling. Keeps
  // dist/ output structure parallel to src/ for easier debugging and
  // avoids cross-module name collisions in the bundled entry files.
  bundle: false,
});
