/**
 * OpenClaw plugin entry.
 *
 * Registers provider-agnostic tools that accept `provider` as a parameter.
 * Each tool iterates the same provider registry the CLI uses, so adding a
 * new platform exposes it to OpenClaw automatically — no tool re-registration.
 *
 * M4 wires the real handlers. This file ships in M1 as a loadable shell so
 * OpenClaw can discover the plugin early.
 */

import { Type } from "@sinclair/typebox";
import { buildRegistry } from "../../providers/bootstrap.js";

// OpenClaw SDK types are loaded lazily so the plugin shell is still
// type-checkable without the peer dep present.
type PluginApi = {
  pluginConfig?: Record<string, unknown>;
  registerTool(tool: {
    name: string;
    label: string;
    description: string;
    parameters: unknown;
    execute(
      id: string,
      params: Record<string, unknown>,
    ): Promise<{ content: Array<{ type: "text"; text: string }>; details: null }>;
  }): void;
};

function toolResult(text: string): { content: Array<{ type: "text"; text: string }>; details: null } {
  return { content: [{ type: "text" as const, text }], details: null };
}

const searchSchema = Type.Object({
  provider: Type.String({ description: "Provider id (e.g. resy). Defaults to config." }),
  query: Type.String({ description: "Free-text venue query" }),
  city: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
});

// Factory exposed as the module default. The actual call to
// `definePluginEntry` lives in an adapter file that imports the openclaw
// peer dep at runtime; this keeps the shell independent.
export function createOpenClawEntry(): {
  id: string;
  name: string;
  description: string;
  register(api: PluginApi): void;
} {
  return {
    id: "restaurant-cli",
    name: "Restaurant",
    description:
      "Pluggable reservation booking via Resy, OpenTable, Tock, and other providers",
    register(api: PluginApi): void {
      const registry = buildRegistry();

      api.registerTool({
        name: "restaurant_search",
        label: "Restaurant Search",
        description:
          "Search venues on a reservation platform. Defaults to the configured provider.",
        parameters: searchSchema,
        async execute(_id: string, params: Record<string, unknown>) {
          const providerId = (params["provider"] as string | undefined) ?? "resy";
          const provider = registry.tryGet(providerId);
          if (!provider) return toolResult(`Unknown provider: ${providerId}`);
          return toolResult(
            `M4: restaurant_search for ${provider.displayName} not yet wired (${JSON.stringify(
              params,
            )})`,
          );
        },
      });
    },
  };
}

export default createOpenClawEntry;
