/**
 * CLI-side installer glue for the OpenClaw plugin.
 *
 * `mirrorCredentialsToOpenClaw` copies provider credentials from the values
 * the CLI already persisted (via `setup.ts → persist()`) into OpenClaw's
 * plugin config at `~/.openclaw/openclaw.json` under
 * `plugins.entries.restaurant-cli.config`.
 *
 * Why: the OpenClaw plugin reads creds from `pluginConfig` only — it does
 * not read `~/.secrets.env` or `~/.config/restaurant-cli/config.yaml`. So
 * after `restaurant setup resy`, the gateway-side tools would still not
 * find credentials. This module is the bridge.
 *
 * Only keys declared in the plugin's `configSchema.properties` are written
 * — the login flow surfaces auxiliary fields (email, firstName) that have
 * no business in OpenClaw config. Stale `<providerId>_*` keys from older
 * setup runs are pruned to keep the config in sync with the current schema.
 *
 * Secret handling (matches the parcel / travel-hub / easypost plugins):
 * sensitive values (auth tokens, session cookies) are NOT inlined into
 * `openclaw.json`. They are written once into the OpenClaw shared secret
 * store (`~/.openclaw/secrets.json`) and the plugin config holds only a
 * `{source:"file", provider:"secrets", id:"/restaurant-cli/<key>"}`
 * SecretRef pointing there. The plugin's `credsFor()` → `resolveSecret`
 * already resolves that ref. Non-secret fields (public apiKey, email) stay
 * inline. This keeps a token in exactly one plaintext location instead of
 * replicating it across config files. Standalone CLI use is unaffected —
 * it still reads `~/.secrets.env` + `config.yaml` and never touches this
 * path.
 *
 * Fails loudly if the plugin isn't registered yet (user forgot to run
 * `openclaw plugins install --link <repo>` first). Idempotent: running
 * again only writes if something actually changed.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { SecretRef } from "../../core/types.js";
import { setOpenClawSecret } from "../../core/secrets.js";

export const OPENCLAW_PLUGIN_ID = "restaurant-cli";

/**
 * Credential field base-names (un-prefixed) that must never be stored inline
 * in `openclaw.json`. These route to the shared secret store as SecretRefs.
 * Resy's `apiKey` is intentionally absent — it is a public client key.
 */
export const SENSITIVE_CRED_KEYS = new Set(["authToken", "sessionCookies", "cvc", "token"]);
// Note: `password` is intentionally NOT here. It is a hard drop (never stored
// anywhere) via the early-continue guard in the write loop — it's an ephemeral
// login input, not a durable credential. Adding it to this set would be
// contradictory: the guard fires first, so it would have no effect.

/** JSON pointer into ~/.openclaw/secrets.json for a prefixed config key. */
function secretPointer(prefixedKey: string): string {
  return `/${OPENCLAW_PLUGIN_ID}/${prefixedKey}`;
}

export type MirrorStatus =
  | { status: "ok"; updated: string[]; removed: string[]; configPath: string }
  | { status: "not-installed"; configPath: string }
  | { status: "plugin-not-registered"; configPath: string };

interface OpenClawConfig {
  plugins?: {
    allow?: string[];
    entries?: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;
  };
}

export function openClawConfigPath(): string {
  return join(homedir(), ".openclaw", "openclaw.json");
}

export interface MirrorOptions {
  /**
   * Explicit set of allowed config keys (full `<providerId>_<field>` form).
   * When omitted, keys are loaded from the plugin manifest's `configSchema`.
   * Tests pass this directly; production callers should leave it undefined.
   */
  allowedKeys?: Set<string>;
  /**
   * Override the set of sensitive credential base-names (un-prefixed, e.g.
   * `authToken`) that route to the shared secret store instead of inline.
   * Defaults to {@link SENSITIVE_CRED_KEYS}. Tests use this to exercise the
   * routing without depending on the production constant.
   */
  sensitiveKeys?: Set<string>;
}

export function mirrorCredentialsToOpenClaw(
  providerId: string,
  creds: Record<string, unknown>,
  options: MirrorOptions = {},
): MirrorStatus {
  const configPath = openClawConfigPath();

  if (!existsSync(configPath)) {
    return { status: "not-installed", configPath };
  }

  const allowedKeys = options.allowedKeys ?? loadSchemaKeys();
  const sensitiveKeys = options.sensitiveKeys ?? SENSITIVE_CRED_KEYS;

  const original = readFileSync(configPath, "utf8");
  let config: OpenClawConfig;
  try {
    config = JSON.parse(original) as OpenClawConfig;
  } catch (e) {
    throw new Error(`Failed to parse ${configPath}: ${(e as Error).message}`);
  }

  const allow = config.plugins?.allow ?? [];
  if (!allow.includes(OPENCLAW_PLUGIN_ID)) {
    return { status: "plugin-not-registered", configPath };
  }

  config.plugins ??= {};
  config.plugins.entries ??= {};
  const entry = (config.plugins.entries[OPENCLAW_PLUGIN_ID] ??= { enabled: true, config: {} });
  entry.enabled = true;
  entry.config ??= {};

  const updated: string[] = [];
  const removed: string[] = [];
  const prefix = `${providerId}_`;

  for (const [k, v] of Object.entries(creds)) {
    if (k === "password") continue; // hard drop: ephemeral login input, never stored
    if (typeof v !== "string" || !v) continue;
    const key = `${prefix}${k}`;
    if (allowedKeys && !allowedKeys.has(key)) continue;

    if (sensitiveKeys.has(k)) {
      // Sensitive: store the value once in ~/.openclaw/secrets.json and put
      // only a SecretRef pointer in the plugin config. Never inline.
      const pointer = secretPointer(key);
      const valueChanged = setOpenClawSecret(pointer, v);
      const ref: SecretRef = { source: "file", provider: "secrets", id: pointer };
      if (valueChanged || !isMatchingRef(entry.config[key], ref)) {
        // Replaces any prior inline plaintext value with the pointer.
        entry.config[key] = ref;
        updated.push(key);
      }
    } else if (entry.config[key] !== v) {
      // Non-secret (public apiKey, email): inline as before.
      entry.config[key] = v;
      updated.push(key);
    }
  }

  // Prune stale <providerId>_* keys that aren't in the current schema. These
  // are leftovers from an older setup run that wrote non-schema values.
  // Only touch keys for THIS provider so an unrelated setup run doesn't
  // clobber another provider's config.
  if (allowedKeys) {
    for (const key of Object.keys(entry.config)) {
      if (!key.startsWith(prefix)) continue;
      if (allowedKeys.has(key)) continue;
      delete entry.config[key];
      removed.push(key);
    }
  }

  if (updated.length > 0 || removed.length > 0) {
    // Write in place at 0600. We deliberately do NOT leave a timestamped
    // `.bak` copy: prior versions did, and those backups preserved inline
    // plaintext secrets on disk indefinitely (flagged by the security
    // audit). openclaw.json now holds only SecretRefs + non-secret fields.
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
    // Clean up secret-bearing backups left by older versions of this mirror.
    // Scoped to the write path so an idempotent no-op call doesn't scan the
    // directory; the first run that converts an inline secret to a ref (always
    // the first run after upgrade) purges them.
    purgeLegacyBackups(configPath);
  }

  return { status: "ok", updated, removed, configPath };
}

/** True if `existing` is already the exact SecretRef we intend to write. */
function isMatchingRef(existing: unknown, ref: SecretRef): boolean {
  return (
    typeof existing === "object" &&
    existing !== null &&
    (existing as SecretRef).source === ref.source &&
    (existing as SecretRef).provider === ref.provider &&
    (existing as SecretRef).id === ref.id
  );
}

/**
 * Delete `openclaw.json.bak.restaurant-*` files written by older versions of
 * this installer. They may contain inline plaintext credentials and serve no
 * purpose now that the mirror stores secrets as refs. Best-effort: failures
 * are swallowed so a permissions hiccup never breaks setup.
 */
function purgeLegacyBackups(configPath: string): void {
  const dir = dirname(configPath);
  const stem = `${basename(configPath)}.bak.restaurant-`;
  try {
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(stem)) continue;
      try {
        unlinkSync(join(dir, name));
      } catch {
        /* ignore individual file errors */
      }
    }
  } catch {
    /* dir unreadable — nothing to clean */
  }
}

/**
 * Walk up from this module's location until we find the plugin manifest,
 * then return the set of declared config-schema property names. Resolves
 * in both the dev (tsx `src/…`) and built (`dist/bin/restaurant.js`) cases.
 * Returns undefined if no manifest is found — caller treats that as "no
 * filter" so the setup flow still succeeds in unusual layouts.
 */
function loadSchemaKeys(): Set<string> | undefined {
  const start = dirname(fileURLToPath(import.meta.url));
  let dir = start;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, "openclaw.plugin.json");
    if (existsSync(candidate)) {
      try {
        const raw = readFileSync(candidate, "utf8");
        const manifest = JSON.parse(raw) as {
          configSchema?: { properties?: Record<string, unknown> };
        };
        const props = manifest.configSchema?.properties;
        if (props && typeof props === "object") {
          return new Set(Object.keys(props));
        }
      } catch {
        return undefined;
      }
      return undefined;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}
