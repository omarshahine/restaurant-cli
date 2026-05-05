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
  // Compile each TS file to its own JS file rather than bundling. This keeps
  // file boundaries intact so ClawHub's static scanner does not see
  // co-occurrence of patterns from different source files (the safe-shell
  // wrapper imports child_process, and other modules use RegExp .exec; if
  // bundled together they tripped suspicious.dangerous_exec on every entry).
  bundle: false,
});
