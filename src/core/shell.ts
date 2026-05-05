/**
 * Shell helpers shared across the CLI snipe command and the OpenClaw
 * schedule_snipe tool. Both need to self-invoke the `restaurant` binary
 * under a restricted `at` environment, and both need to safely quote user
 * input before concatenating into a shell command.
 */

import { realpathSync } from "node:fs";
import { whichBinary } from "./safe-shell.js";

/**
 * Resolve the absolute path to the `restaurant` binary so an `at`-scheduled
 * job can invoke it under a restricted PATH.
 *
 * Preference order:
 *   1. `which restaurant` — works when the package is on $PATH (`npm i -g` / `npm link`)
 *   2. realpath of `process.argv[1]` — works when invoked as `node dist/bin/restaurant.js`
 *   3. bare `"restaurant"` — at-daemon's PATH may or may not find it; fallback only
 */
export function resolveCliBinary(): string {
  const onPath = whichBinary("restaurant");
  if (onPath) return onPath;
  try {
    return realpathSync(process.argv[1] ?? "restaurant");
  } catch {
    return "restaurant";
  }
}

/**
 * Single-quote-wrap a string for bash. Escapes inner single quotes using the
 * standard `'\''` dance. Safe for concatenation into bash-style invocations.
 *
 * This is NOT sufficient by itself for arbitrary code contexts — e.g. if the
 * output is interpolated into a double-quoted bash string, the caller needs
 * a different escape. Use only for argv-style `cmd 'arg1' 'arg2'` forms.
 */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
