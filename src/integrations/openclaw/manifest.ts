/**
 * Source of truth for openclaw.plugin.json contents. The JSON file is
 * committed at the repo root so ClawHub can discover it; this module
 * generates it programmatically from registry state so adding a provider
 * automatically expands the config surface.
 *
 * M4 wires a `pnpm gen:openclaw-manifest` script that writes this out.
 */

import { buildRegistry } from "../../providers/bootstrap.js";

interface ConfigSchemaProperty {
  type?: string;
  description?: string;
  oneOf?: unknown[];
}

export function buildManifest(): {
  id: string;
  name: string;
  description: string;
  skills: string[];
  configSchema: {
    type: "object";
    properties: Record<string, ConfigSchemaProperty>;
    additionalProperties: boolean;
  };
  uiHints: Record<string, { label: string; sensitive: boolean; help?: string }>;
} {
  const registry = buildRegistry();
  const properties: Record<string, ConfigSchemaProperty> = {};
  const uiHints: Record<string, { label: string; sensitive: boolean; help?: string }> = {};

  for (const p of registry.list()) {
    for (const prompt of p.auth.setupPrompts()) {
      if (!prompt.sensitive) continue;
      const key = `${p.id}_${prompt.id}`;
      properties[key] = {
        oneOf: [
          { type: "string", description: `${p.displayName} ${prompt.label}` },
          {
            type: "object",
            description: `SecretRef for ${p.displayName} ${prompt.label}`,
          },
        ],
      };
      uiHints[key] = {
        label: `${p.displayName} ${prompt.label}`,
        sensitive: true,
        ...(prompt.help ? { help: prompt.help } : {}),
      };
    }
  }

  return {
    id: "restaurant-cli",
    name: "Restaurant",
    description:
      "Pluggable reservation booking via Resy, OpenTable, Tock, and other providers",
    skills: ["skills/restaurant"],
    configSchema: {
      type: "object",
      properties,
      additionalProperties: false,
    },
    uiHints,
  };
}
