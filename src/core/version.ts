/**
 * Single source of truth for the CLI version string.
 *
 * Read from `package.json` at runtime (not bundled) so npm version bumps
 * propagate without code changes. The relative path resolves against the
 * built artifact's location (dist/src/core/version.js → ../../../package.json)
 * AND against the source path during tests (src/core/version.ts →
 * ../../package.json), so both layouts work.
 *
 * If the file isn't found (shouldn't happen — `files` in package.json includes
 * it transitively), falls back to the literal "unknown" rather than crashing
 * the CLI.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function resolveVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Candidates: dist layout (../../../package.json) and src layout (../../package.json).
  const candidates = [
    join(here, "..", "..", "..", "package.json"),
    join(here, "..", "..", "package.json"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const pkg = JSON.parse(readFileSync(p, "utf8")) as { version?: string; name?: string };
      if (pkg.name === "restaurant-cli" && pkg.version) return pkg.version;
    } catch {
      // try next candidate
    }
  }
  return "unknown";
}

export const VERSION = resolveVersion();
