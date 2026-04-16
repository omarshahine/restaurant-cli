import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig, loadConfig, saveConfig, upsertProvider } from "../../src/core/config.js";

describe("core/config", () => {
  let tmp: string;
  const origXdg = process.env.XDG_CONFIG_HOME;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "restaurant-cli-test-"));
    process.env.XDG_CONFIG_HOME = tmp;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    if (origXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = origXdg;
  });

  it("returns default config when file is absent", () => {
    const c = loadConfig();
    expect(c.version).toBe(1);
    expect(c.defaults.provider).toBe("resy");
    expect(c.scheduler.backend).toBe("at");
  });

  it("roundtrips saved config", () => {
    const cfg = defaultConfig();
    saveConfig(cfg);
    const reloaded = loadConfig();
    expect(reloaded).toEqual(cfg);
  });

  it("upsertProvider merges into the providers map", () => {
    const cfg = defaultConfig();
    const next = upsertProvider(cfg, "resy", {
      email: "a@b.com",
      tokenRef: { source: "env", id: "RESY_AUTH_TOKEN" },
    });
    expect(next.providers.resy).toBeDefined();
    expect(next.providers.resy!.email).toBe("a@b.com");
    expect(cfg.providers.resy).toBeUndefined(); // original unchanged
  });
});
