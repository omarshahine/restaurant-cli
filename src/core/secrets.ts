import { readFileSync, existsSync, appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { AuthError } from "./errors.js";
import { isSecretRef, type SecretRef } from "./types.js";

const SECRETS_FILE = join(homedir(), ".secrets.env");

export function openclawSecretsPath(): string {
  return join(homedir(), ".openclaw", "secrets.json");
}

/**
 * Follow an RFC 6901 JSON Pointer into a parsed JSON document. Returns
 * undefined for missing paths or non-object traversals.
 *
 * Per RFC 6901: empty string `""` → root document, `"/"` → the member with
 * the empty-string key (i.e. `doc[""]`), `"/a/b"` → `doc.a.b`. Everything
 * else traverses normally with `~0`/`~1` un-escaping for `~`/`/` in keys.
 */
function jsonPointer(doc: unknown, pointer: string): unknown {
  if (!pointer) return doc;
  const parts = pointer
    .replace(/^\//, "")
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: unknown = doc;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Resolves a SecretRef (or inline string, or env-var interpolation like
 * `${RESY_API_TOKEN}`) to the underlying secret value.
 *
 * Supported sources:
 *   - "env": looks up `process.env[ref.id]`
 *   - "file" (no provider, or provider other than "secrets"): reads the file
 *     at `ref.id` as a plaintext path, trims whitespace
 *   - "file" with `provider: "secrets"`: reads `~/.openclaw/secrets.json`
 *     and follows `ref.id` as an RFC 6901 JSON pointer. This matches the
 *     idiomatic OpenClaw shared-secrets-store pattern used by travel-hub,
 *     easypost, and other host plugins, letting the same token live in one
 *     place across the gateway.
 *
 * `exec` (Keychain) is intentionally NOT supported — the user's global rule
 * forbids macOS Keychain. Secrets live in ~/.secrets.env.
 */
export function resolveSecret(value: SecretRef | string | undefined): string | undefined {
  if (!value) return undefined;

  if (typeof value === "string") {
    // Handle ${ENV_VAR} interpolation so config can inline env refs.
    const m = value.match(/^\$\{([A-Z0-9_]+)\}$/);
    if (m) return process.env[m[1]!];
    return value;
  }

  if (isSecretRef(value)) {
    switch (value.source) {
      case "env":
        return process.env[value.id];
      case "file":
        if (value.provider === "secrets") {
          const path = openclawSecretsPath();
          if (!existsSync(path)) return undefined;
          try {
            const doc = JSON.parse(readFileSync(path, "utf8"));
            const v = jsonPointer(doc, value.id);
            return typeof v === "string" && v ? v : undefined;
          } catch {
            return undefined;
          }
        }
        try {
          return readFileSync(value.id, "utf8").trim();
        } catch {
          return undefined;
        }
      case "exec":
        // Keychain/exec-based secrets are intentionally unsupported.
        throw new AuthError(
          `SecretRef source "exec" is not supported. Store secrets in ~/.secrets.env instead.`,
        );
      default:
        return undefined;
    }
  }

  return undefined;
}

/**
 * Append a new `export KEY=VALUE` line to ~/.secrets.env. Creates the file if
 * missing. Does NOT deduplicate — callers should check first via
 * `secretKeyPresent`.
 */
export function appendSecret(key: string, value: string): void {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
    throw new AuthError(`Invalid secret key name: ${key}`);
  }
  mkdirSync(dirname(SECRETS_FILE), { recursive: true });
  const line = `export ${key}=${quoteShellValue(value)}\n`;
  appendFileSync(SECRETS_FILE, line, { mode: 0o600 });
}

export function secretKeyPresent(key: string): boolean {
  if (!existsSync(SECRETS_FILE)) return false;
  const re = new RegExp(`^\\s*export\\s+${key}=`, "m");
  return re.test(readFileSync(SECRETS_FILE, "utf8"));
}

export function secretsFilePath(): string {
  return SECRETS_FILE;
}

/**
 * Read a single value out of the OpenClaw shared secret store
 * (`~/.openclaw/secrets.json`) by RFC 6901 JSON pointer. Returns undefined
 * if the store, the path, or a non-string value is missing. This is the
 * read counterpart to {@link setOpenClawSecret} and mirrors how
 * `resolveSecret` follows a `provider: "secrets"` ref.
 */
export function readOpenClawSecret(pointer: string): string | undefined {
  const path = openclawSecretsPath();
  if (!existsSync(path)) return undefined;
  try {
    const doc = JSON.parse(readFileSync(path, "utf8"));
    const v = jsonPointer(doc, pointer);
    return typeof v === "string" && v ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Write a single value into the OpenClaw shared secret store
 * (`~/.openclaw/secrets.json`) at an RFC 6901 JSON pointer, creating the
 * file and any intermediate objects. The store is the one plaintext home
 * for a token; plugin config holds only a `{source:"file",
 * provider:"secrets", id:<pointer>}` SecretRef pointing here, so the value
 * is never duplicated into `~/.openclaw/openclaw.json`. Returns true if the
 * stored value changed (new key or rotated value), false if it was already
 * identical.
 *
 * Only simple top-level-ish pointers are supported (`/a`, `/a/b`); pointer
 * segments un-escape `~1`/`~0` per RFC 6901 to match {@link jsonPointer}.
 */
export function setOpenClawSecret(pointer: string, value: string): boolean {
  if (!pointer.startsWith("/")) {
    throw new AuthError(`OpenClaw secret pointer must start with "/": ${pointer}`);
  }
  const path = openclawSecretsPath();
  let doc: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (parsed && typeof parsed === "object") doc = parsed as Record<string, unknown>;
    } catch {
      // Corrupt/non-JSON store: refuse to clobber it silently.
      throw new AuthError(`Cannot parse OpenClaw secret store at ${path}`);
    }
  }

  const segments = pointer
    .replace(/^\//, "")
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));

  let cur: Record<string, unknown> = doc;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    const next = cur[seg];
    if (next == null || typeof next !== "object") {
      cur[seg] = {};
    }
    cur = cur[seg] as Record<string, unknown>;
  }
  const leaf = segments[segments.length - 1]!;
  if (cur[leaf] === value) return false;
  cur[leaf] = value;

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n", { mode: 0o600 });
  return true;
}

function quoteShellValue(v: string): string {
  // Single-quote and escape any single quotes in the value.
  return `'${v.replace(/'/g, `'\\''`)}'`;
}
