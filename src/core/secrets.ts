import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { AuthError } from "./errors.js";
import { isSecretRef, type SecretRef } from "./types.js";

const SECRETS_FILE = join(homedir(), ".secrets.env");

/**
 * Resolves a SecretRef (or inline string, or env-var interpolation like
 * `${RESY_API_TOKEN}`) to the underlying secret value.
 *
 * Supported sources:
 *   - "env": looks up `process.env[ref.id]`
 *   - "file": reads the file at `ref.id`, trims whitespace
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

function quoteShellValue(v: string): string {
  // Single-quote and escape any single quotes in the value.
  return `'${v.replace(/'/g, `'\\''`)}'`;
}
