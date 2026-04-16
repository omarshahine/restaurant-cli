import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { ConfigError } from "./errors.js";
import type { AppConfig, ProviderConfig } from "./types.js";

export function configPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(xdg, "restaurant-cli", "config.yaml");
}

export function defaultConfig(): AppConfig {
  return {
    version: 1,
    defaults: {
      provider: "resy",
      partySize: 2,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    },
    providers: {},
    scheduler: { backend: "at" },
    logging: { level: "info" },
  };
}

export function loadConfig(): AppConfig {
  if (!existsSync(configPath())) {
    return defaultConfig();
  }
  let raw: unknown;
  try {
    raw = YAML.parse(readFileSync(configPath(), "utf8"));
  } catch (e) {
    throw new ConfigError(`Failed to parse ${configPath()}: ${(e as Error).message}`);
  }
  if (!raw || typeof raw !== "object") {
    throw new ConfigError(`Invalid config at ${configPath()}: expected an object`);
  }
  const merged = { ...defaultConfig(), ...(raw as object) } as AppConfig;
  merged.providers = { ...(merged.providers ?? {}) };
  return merged;
}

export function saveConfig(config: AppConfig): void {
  mkdirSync(dirname(configPath()), { recursive: true });
  writeFileSync(configPath(), YAML.stringify(config), { mode: 0o600 });
}

export function upsertProvider(config: AppConfig, id: string, patch: ProviderConfig): AppConfig {
  return {
    ...config,
    providers: {
      ...config.providers,
      [id]: { ...(config.providers[id] ?? {}), ...patch },
    },
  };
}
