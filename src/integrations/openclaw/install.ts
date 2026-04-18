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
 * Values are written inline as plain strings. The OpenClaw config file
 * is 0600 by convention; swap to SecretRef manually if you need a
 * different store. The plugin's `credsFor()` already accepts both shapes.
 *
 * Fails loudly if the plugin isn't registered yet (user forgot to run
 * `openclaw plugins install --link <repo>` first). Idempotent: running
 * again only writes if something actually changed.
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const OPENCLAW_PLUGIN_ID = "restaurant-cli";

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
    if (k === "password") continue;
    if (typeof v !== "string" || !v) continue;
    const key = `${prefix}${k}`;
    if (allowedKeys && !allowedKeys.has(key)) continue;
    if (entry.config[key] !== v) {
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
    const backup = `${configPath}.bak.restaurant-${Date.now()}`;
    copyFileSync(configPath, backup);
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  }

  return { status: "ok", updated, removed, configPath };
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
