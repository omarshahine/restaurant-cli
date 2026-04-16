/**
 * SecretRef matches the OpenClaw SDK pattern so the same config shape works
 * whether restaurant-cli is invoked standalone or loaded as an OpenClaw plugin.
 */
export interface SecretRef {
  source: "env" | "file" | "exec";
  provider?: string;
  id: string;
}

export function isSecretRef(value: unknown): value is SecretRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "source" in value &&
    "id" in value &&
    typeof (value as SecretRef).source === "string" &&
    typeof (value as SecretRef).id === "string"
  );
}

export interface ProviderConfig {
  /** Free-form per-provider settings (email, region, etc.). */
  [key: string]: unknown;
  tokenRef?: SecretRef | string;
  /** Inline token as last resort; discouraged. */
  token?: string;
}

export interface AppConfig {
  version: 1;
  defaults: {
    provider: string;
    partySize: number;
    timezone: string;
  };
  providers: Record<string, ProviderConfig>;
  scheduler: {
    backend: "at" | "daemon";
  };
  logging: {
    level: "debug" | "info" | "warn" | "error";
    file?: string;
  };
}
