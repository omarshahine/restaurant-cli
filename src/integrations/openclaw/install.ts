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
import { join } from "node:path";

export const OPENCLAW_PLUGIN_ID = "restaurant-cli";

export type MirrorStatus =
  | { status: "ok"; updated: string[]; configPath: string }
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

export function mirrorCredentialsToOpenClaw(
  providerId: string,
  creds: Record<string, unknown>,
): MirrorStatus {
  const configPath = openClawConfigPath();

  if (!existsSync(configPath)) {
    return { status: "not-installed", configPath };
  }

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
  const prefix = `${providerId}_`;
  for (const [k, v] of Object.entries(creds)) {
    if (k === "password") continue;
    if (typeof v !== "string" || !v) continue;
    const key = `${prefix}${k}`;
    if (entry.config[key] !== v) {
      entry.config[key] = v;
      updated.push(key);
    }
  }

  if (updated.length > 0) {
    const backup = `${configPath}.bak.restaurant-${Date.now()}`;
    copyFileSync(configPath, backup);
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  }

  return { status: "ok", updated, configPath };
}
