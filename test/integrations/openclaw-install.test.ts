import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  mirrorCredentialsToOpenClaw,
  openClawConfigPath,
  OPENCLAW_PLUGIN_ID,
} from "../../src/integrations/openclaw/install.js";

describe("integrations/openclaw/install", () => {
  let workDir: string;
  let configPath: string;
  const RESY_KEYS = new Set(["resy_apiKey", "resy_authToken"]);

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "restaurant-cli-openclaw-"));
    // openClawConfigPath() resolves via homedir(), which honors $HOME on
    // POSIX. Pointing HOME at a tmpdir redirects all file ops to the
    // per-test fixture and keeps the test hermetic.
    process.env["HOME"] = workDir;
    const openClawDir = join(workDir, ".openclaw");
    mkdirSync(openClawDir, { recursive: true });
    configPath = join(openClawDir, "openclaw.json");
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  function writeConfig(obj: unknown): void {
    writeFileSync(configPath, JSON.stringify(obj, null, 2));
  }

  function readConfig(): Record<string, unknown> {
    return JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  }

  it("returns 'not-installed' when OpenClaw config is missing", () => {
    // No fixture written.
    rmSync(configPath, { force: true });
    expect(existsSync(configPath)).toBe(false);
    const result = mirrorCredentialsToOpenClaw("resy", { authToken: "abc" });
    expect(result.status).toBe("not-installed");
  });

  it("returns 'plugin-not-registered' when plugin is not in plugins.allow", () => {
    writeConfig({ plugins: { allow: ["something-else"] } });
    const result = mirrorCredentialsToOpenClaw("resy", { authToken: "abc" });
    expect(result.status).toBe("plugin-not-registered");
    // Must not mutate the file.
    expect(readConfig()).toEqual({ plugins: { allow: ["something-else"] } });
  });

  it("writes credentials under plugins.entries.<id>.config with provider-prefixed keys", () => {
    writeConfig({
      plugins: { allow: [OPENCLAW_PLUGIN_ID], entries: {} },
    });

    const result = mirrorCredentialsToOpenClaw(
      "resy",
      { apiKey: "pk_123", authToken: "tok_456" },
      { allowedKeys: RESY_KEYS },
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.updated.sort()).toEqual(["resy_apiKey", "resy_authToken"]);
    expect(result.removed).toEqual([]);

    const cfg = readConfig();
    const entry = (cfg["plugins"] as any).entries[OPENCLAW_PLUGIN_ID];
    expect(entry.enabled).toBe(true);
    expect(entry.config).toEqual({
      resy_apiKey: "pk_123",
      resy_authToken: "tok_456",
    });
  });

  it("filters out keys not declared in the schema (e.g. email, firstName)", () => {
    writeConfig({ plugins: { allow: [OPENCLAW_PLUGIN_ID], entries: {} } });

    const result = mirrorCredentialsToOpenClaw(
      "resy",
      {
        apiKey: "pk_123",
        authToken: "tok_456",
        email: "omarshahine@users.noreply.github.com",
        firstName: "Omar",
      },
      { allowedKeys: RESY_KEYS },
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const entry = (readConfig()["plugins"] as any).entries[OPENCLAW_PLUGIN_ID];
    expect(Object.keys(entry.config).sort()).toEqual(["resy_apiKey", "resy_authToken"]);
    expect(entry.config).not.toHaveProperty("resy_email");
    expect(entry.config).not.toHaveProperty("resy_firstName");
  });

  it("prunes stale provider-prefixed keys that are no longer in the schema", () => {
    writeConfig({
      plugins: {
        allow: [OPENCLAW_PLUGIN_ID],
        entries: {
          [OPENCLAW_PLUGIN_ID]: {
            enabled: true,
            config: {
              resy_authToken: "old_tok",
              resy_email: "leftover@example.com", // stale — not in schema
              resy_firstName: "Leftover", // stale — not in schema
              opentable_sessionId: "keep_me", // DIFFERENT provider — must survive
            },
          },
        },
      },
    });

    const result = mirrorCredentialsToOpenClaw(
      "resy",
      { authToken: "new_tok" },
      { allowedKeys: RESY_KEYS },
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.updated).toEqual(["resy_authToken"]);
    expect(result.removed.sort()).toEqual(["resy_email", "resy_firstName"]);

    const entry = (readConfig()["plugins"] as any).entries[OPENCLAW_PLUGIN_ID];
    expect(entry.config).toEqual({
      resy_authToken: "new_tok",
      opentable_sessionId: "keep_me",
    });
  });

  it("skips empty values and the reserved 'password' field", () => {
    writeConfig({
      plugins: { allow: [OPENCLAW_PLUGIN_ID], entries: {} },
    });

    const result = mirrorCredentialsToOpenClaw(
      "resy",
      {
        authToken: "tok_456",
        password: "hunter2", // must never persist
        apiKey: "", // empty → skip
      },
      { allowedKeys: RESY_KEYS },
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const entry = (readConfig()["plugins"] as any).entries[OPENCLAW_PLUGIN_ID];
    expect(entry.config).toEqual({ resy_authToken: "tok_456" });
  });

  it("is idempotent — re-running with same creds makes no changes", () => {
    writeConfig({ plugins: { allow: [OPENCLAW_PLUGIN_ID], entries: {} } });

    const first = mirrorCredentialsToOpenClaw(
      "resy",
      { authToken: "tok" },
      { allowedKeys: RESY_KEYS },
    );
    expect(first.status === "ok" && first.updated.length).toBe(1);

    const second = mirrorCredentialsToOpenClaw(
      "resy",
      { authToken: "tok" },
      { allowedKeys: RESY_KEYS },
    );
    expect(second.status).toBe("ok");
    if (second.status !== "ok") return;
    expect(second.updated).toEqual([]);
    expect(second.removed).toEqual([]);
  });

  it("preserves unrelated plugin entries", () => {
    writeConfig({
      plugins: {
        allow: [OPENCLAW_PLUGIN_ID, "other-plugin"],
        entries: {
          "other-plugin": { enabled: true, config: { foo: "bar" } },
        },
      },
    });

    mirrorCredentialsToOpenClaw("resy", { authToken: "tok" }, { allowedKeys: RESY_KEYS });

    const cfg = readConfig() as any;
    expect(cfg.plugins.entries["other-plugin"]).toEqual({
      enabled: true,
      config: { foo: "bar" },
    });
  });

  it("backs up the config file before writing", () => {
    writeConfig({ plugins: { allow: [OPENCLAW_PLUGIN_ID], entries: {} } });
    const before = readFileSync(configPath, "utf8");

    mirrorCredentialsToOpenClaw("resy", { authToken: "tok" }, { allowedKeys: RESY_KEYS });

    const backups = readdirSync(join(workDir, ".openclaw")).filter((f) =>
      f.startsWith("openclaw.json.bak.restaurant-"),
    );
    expect(backups.length).toBe(1);
    expect(readFileSync(join(workDir, ".openclaw", backups[0]!), "utf8")).toBe(before);
  });

  it("loads schema keys from the plugin manifest when allowedKeys omitted", () => {
    // No explicit allowedKeys — relies on the manifest walk-up finding
    // the real openclaw.plugin.json in the repo root. Verifies resy_email
    // (not in schema) is dropped while resy_authToken (in schema) lands.
    writeConfig({ plugins: { allow: [OPENCLAW_PLUGIN_ID], entries: {} } });

    const result = mirrorCredentialsToOpenClaw("resy", {
      authToken: "tok",
      email: "omarshahine@users.noreply.github.com",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const entry = (readConfig()["plugins"] as any).entries[OPENCLAW_PLUGIN_ID];
    expect(entry.config).toHaveProperty("resy_authToken", "tok");
    expect(entry.config).not.toHaveProperty("resy_email");
  });

  it("openClawConfigPath points at ~/.openclaw/openclaw.json", () => {
    expect(openClawConfigPath()).toBe(configPath);
  });
});
