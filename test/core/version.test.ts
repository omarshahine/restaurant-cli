import { describe, it, expect } from "vitest";
import { VERSION } from "../../src/core/version.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

describe("core/version", () => {
  it("matches the version in package.json (single source of truth)", () => {
    const pkgPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "package.json",
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });
});
