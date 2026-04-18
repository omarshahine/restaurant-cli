import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSecret } from "../../src/core/secrets.js";

describe("core/secrets resolveSecret", () => {
  let tmpHome: string;
  const origHome = process.env.HOME;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "restaurant-cli-secrets-test-"));
    process.env.HOME = tmpHome;
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
  });

  it("returns undefined for empty input", () => {
    expect(resolveSecret(undefined)).toBeUndefined();
    expect(resolveSecret("")).toBeUndefined();
  });

  it("passes plain strings through verbatim", () => {
    expect(resolveSecret("hello")).toBe("hello");
  });

  it("interpolates ${ENV_VAR} strings", () => {
    process.env.RESTAURANT_CLI_TEST_KEY = "interp-value";
    try {
      expect(resolveSecret("${RESTAURANT_CLI_TEST_KEY}")).toBe("interp-value");
    } finally {
      delete process.env.RESTAURANT_CLI_TEST_KEY;
    }
  });

  it("resolves source:env SecretRef", () => {
    process.env.RESTAURANT_CLI_ENV_REF = "env-ref-value";
    try {
      expect(resolveSecret({ source: "env", id: "RESTAURANT_CLI_ENV_REF" })).toBe("env-ref-value");
    } finally {
      delete process.env.RESTAURANT_CLI_ENV_REF;
    }
  });

  it("resolves source:file SecretRef (plaintext filesystem path)", () => {
    const p = join(tmpHome, "token.txt");
    writeFileSync(p, "file-body-value\n");
    expect(resolveSecret({ source: "file", id: p })).toBe("file-body-value");
  });

  describe("source:file provider:secrets (OpenClaw shared-secrets-store)", () => {
    it("resolves a JSON pointer into ~/.openclaw/secrets.json", () => {
      const dir = join(tmpHome, ".openclaw");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "secrets.json"),
        JSON.stringify({
          plugins: { "restaurant-cli": { resy_authToken: "shared-store-value" } },
        }),
      );
      expect(
        resolveSecret({
          source: "file",
          provider: "secrets",
          id: "/plugins/restaurant-cli/resy_authToken",
        }),
      ).toBe("shared-store-value");
    });

    it("returns undefined when the secrets file is missing", () => {
      expect(
        resolveSecret({
          source: "file",
          provider: "secrets",
          id: "/plugins/restaurant-cli/resy_authToken",
        }),
      ).toBeUndefined();
    });

    it("returns undefined when the JSON pointer does not resolve", () => {
      const dir = join(tmpHome, ".openclaw");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "secrets.json"), JSON.stringify({ plugins: {} }));
      expect(
        resolveSecret({
          source: "file",
          provider: "secrets",
          id: "/plugins/restaurant-cli/resy_authToken",
        }),
      ).toBeUndefined();
    });

    it("returns undefined when the pointed value is not a string", () => {
      const dir = join(tmpHome, ".openclaw");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "secrets.json"),
        JSON.stringify({ plugins: { "restaurant-cli": { resy_authToken: 42 } } }),
      );
      expect(
        resolveSecret({
          source: "file",
          provider: "secrets",
          id: "/plugins/restaurant-cli/resy_authToken",
        }),
      ).toBeUndefined();
    });

    it("handles JSON pointer escapes (~0 for ~, ~1 for /)", () => {
      const dir = join(tmpHome, ".openclaw");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "secrets.json"),
        JSON.stringify({ "a/b": { "c~d": "escaped-value" } }),
      );
      expect(
        resolveSecret({
          source: "file",
          provider: "secrets",
          id: "/a~1b/c~0d",
        }),
      ).toBe("escaped-value");
    });
  });

  it("throws on source:exec (keychain unsupported)", () => {
    expect(() => resolveSecret({ source: "exec", id: "anything" })).toThrow(/not supported/);
  });
});
