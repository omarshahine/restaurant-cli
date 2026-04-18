/**
 * OpenClaw plugin entry.
 *
 * Every tool here is provider-agnostic — it takes a `provider` string (defaults
 * to the configured default) and dispatches through the same `ProviderRegistry`
 * the CLI uses. Adding a new platform exposes it to OpenClaw automatically
 * with zero changes to this file.
 *
 * The OpenClaw SDK is listed as an optional peerDependency so the plugin shell
 * is still importable as a plain library without pulling the SDK in. The
 * actual call to `definePluginEntry` is deferred to a thin adapter
 * (`./adapter.ts`) that imports `openclaw/plugin-sdk/plugin-entry` at runtime.
 */

import { Type } from "@sinclair/typebox";
import { buildRegistry } from "../../providers/bootstrap.js";
import { createAtScheduler } from "../../scheduler/at.js";
import { parseReleaseAt } from "../../core/time.js";
import { resolveSecret } from "../../core/secrets.js";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { execSync } from "node:child_process";
import type { Credentials, Provider } from "../../providers/types.js";

// OpenClaw SDK types are loaded lazily so the plugin shell is still
// type-checkable without the peer dep present.
type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: null;
};

type PluginApi = {
  pluginConfig?: Record<string, unknown>;
  registerTool(tool: {
    name: string;
    label: string;
    description: string;
    parameters: unknown;
    execute(id: string, params: Record<string, unknown>): Promise<ToolResult>;
  }): void;
};

function ok(text: string): ToolResult {
  return { content: [{ type: "text" as const, text }], details: null };
}
function okJson(obj: unknown): ToolResult {
  return ok(JSON.stringify(obj, null, 2));
}
function err(text: string): ToolResult {
  return ok(`ERROR: ${text}`);
}

/**
 * Build a Credentials object for a given provider from `pluginConfig`. Keys
 * follow the `{providerId}_{key}` convention — e.g. `resy_authToken`,
 * `resy_apiKey`. Prefix stripped before handoff to the provider's auth
 * helper so it can reuse the same CLI convention (`creds.authToken`,
 * `creds.apiKey`).
 *
 * Not tied to `setupPrompts()`: the setup prompts are the interactive-CLI
 * surface and don't include the durable post-login token (which is what
 * we store in ~/.secrets.env as `RESY_AUTH_TOKEN`). OpenClaw consumers
 * are expected to configure the durable token directly.
 */
function credsFor(
  provider: Provider,
  cfg: Record<string, unknown> | undefined,
): Credentials {
  const creds: Credentials = {};
  const prefix = `${provider.id}_`;
  for (const [key, raw] of Object.entries(cfg ?? {})) {
    if (!key.startsWith(prefix)) continue;
    const stripped = key.slice(prefix.length);
    if (typeof raw === "string") {
      creds[stripped] = raw;
    } else if (raw && typeof raw === "object") {
      const resolved = resolveSecret(raw as never);
      if (resolved) creds[stripped] = resolved;
    }
  }
  return creds;
}

function resolveCliBinary(): string {
  try {
    const out = execSync("which restaurant", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    if (out) return out;
  } catch {
    // fall through
  }
  try {
    return realpathSync(process.argv[1] ?? "restaurant");
  } catch {
    return "restaurant";
  }
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// --- Schemas --------------------------------------------------------------

const providerArg = Type.Optional(
  Type.String({
    description:
      "Provider id (e.g. 'resy', 'opentable'). Omitted → uses the configured default.",
  }),
);

const searchSchema = Type.Object({
  provider: providerArg,
  query: Type.String({ description: "Free-text venue query" }),
  city: Type.Optional(Type.String({ description: "Provider city slug (e.g. 'ny')" })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
});

const availabilitySchema = Type.Object({
  provider: providerArg,
  venueId: Type.String(),
  date: Type.String({ description: "YYYY-MM-DD" }),
  partySize: Type.Number({ minimum: 1, maximum: 20 }),
});

const bookSchema = Type.Object({
  provider: providerArg,
  venueId: Type.String(),
  date: Type.String({ description: "YYYY-MM-DD" }),
  time: Type.String({ description: "HH:mm (24h)" }),
  partySize: Type.Number({ minimum: 1, maximum: 20 }),
  slotToken: Type.Optional(
    Type.String({
      description:
        "Provider-specific slot token from a prior availability call. Omit to re-lookup.",
    }),
  ),
  notes: Type.Optional(Type.String()),
});

const snipeSchema = Type.Object({
  provider: providerArg,
  venueId: Type.String(),
  date: Type.String({ description: "YYYY-MM-DD" }),
  time: Type.String({ description: "HH:mm (24h)" }),
  partySize: Type.Number({ minimum: 1, maximum: 20 }),
  releaseAt: Type.String({
    description:
      "ISO8601 with timezone offset when the booking window opens, e.g. '2026-04-30T10:00-07:00'",
  }),
});

const listSchema = Type.Object({
  provider: providerArg,
  upcoming: Type.Optional(Type.Boolean()),
});

const cancelSchema = Type.Object({
  provider: providerArg,
  reservationId: Type.String(),
});

// --- Entry ----------------------------------------------------------------

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
      const defaultProviderId =
        (api.pluginConfig?.["defaultProvider"] as string | undefined) ?? "resy";

      const resolveProvider = (explicit?: string): Provider | string => {
        const id = explicit || defaultProviderId;
        const p = registry.tryGet(id);
        if (!p) return `Unknown provider: ${id}. Registered: ${registry.ids().join(", ")}`;
        return p;
      };

      // -- restaurant_search ------------------------------------------------
      api.registerTool({
        name: "restaurant_search",
        label: "Search Venues",
        description:
          "Search venues on a reservation platform by free-text query. Returns {id, name, city, url} for each hit.",
        parameters: searchSchema,
        async execute(_id, params) {
          const provider = resolveProvider(params["provider"] as string | undefined);
          if (typeof provider === "string") return err(provider);
          if (!provider.capabilities.search) {
            return err(`${provider.displayName} does not support search.`);
          }
          try {
            const creds = credsFor(provider, api.pluginConfig);
            const venues = await provider.searchVenues(
              {
                query: String(params["query"]),
                ...(params["city"] ? { city: String(params["city"]) } : {}),
                ...(params["limit"] ? { limit: Number(params["limit"]) } : {}),
              },
              creds,
            );
            return okJson(venues);
          } catch (e) {
            return err(e instanceof Error ? e.message : String(e));
          }
        },
      });

      // -- restaurant_availability -----------------------------------------
      api.registerTool({
        name: "restaurant_availability",
        label: "Check Availability",
        description:
          "List open time slots for a venue on a given date. Each slot carries a token that can be fed to restaurant_book.",
        parameters: availabilitySchema,
        async execute(_id, params) {
          const provider = resolveProvider(params["provider"] as string | undefined);
          if (typeof provider === "string") return err(provider);
          if (!provider.capabilities.availability) {
            return err(`${provider.displayName} does not support availability lookup.`);
          }
          try {
            const creds = credsFor(provider, api.pluginConfig);
            const slots = await provider.getAvailability(
              {
                venueId: String(params["venueId"]),
                date: String(params["date"]),
                partySize: Number(params["partySize"]),
              },
              creds,
            );
            return okJson(slots);
          } catch (e) {
            return err(e instanceof Error ? e.message : String(e));
          }
        },
      });

      // -- restaurant_book -------------------------------------------------
      // Safety: booking is destructive. OpenClaw clients are expected to
      // confirm with the user before invoking this tool — the plugin does
      // not prompt. Tool description makes that explicit.
      api.registerTool({
        name: "restaurant_book",
        label: "Book Reservation",
        description:
          "Confirm a reservation. DESTRUCTIVE — books immediately against the configured account. Confirm with the user before invoking.",
        parameters: bookSchema,
        async execute(_id, params) {
          const provider = resolveProvider(params["provider"] as string | undefined);
          if (typeof provider === "string") return err(provider);
          if (!provider.capabilities.book) {
            if (provider.capabilities.bookUrl && provider.getBookingUrl) {
              // Graceful degradation for bookUrl-only providers (OpenTable).
              const url = await provider.getBookingUrl(
                {
                  venueId: String(params["venueId"]),
                  date: String(params["date"]),
                  time: String(params["time"]),
                  partySize: Number(params["partySize"]),
                },
                credsFor(provider, api.pluginConfig),
              );
              return ok(
                `${provider.displayName} does not support API booking. Open this URL to confirm manually:\n${url}`,
              );
            }
            return err(`${provider.displayName} does not support booking.`);
          }
          try {
            const creds = credsFor(provider, api.pluginConfig);
            const result = await provider.book(
              {
                venueId: String(params["venueId"]),
                date: String(params["date"]),
                time: String(params["time"]),
                partySize: Number(params["partySize"]),
                ...(params["slotToken"] ? { slotToken: String(params["slotToken"]) } : {}),
                ...(params["notes"] ? { notes: String(params["notes"]) } : {}),
              },
              creds,
            );
            return okJson(result);
          } catch (e) {
            return err(e instanceof Error ? e.message : String(e));
          }
        },
      });

      // -- restaurant_schedule_snipe ---------------------------------------
      api.registerTool({
        name: "restaurant_schedule_snipe",
        label: "Queue a Snipe",
        description:
          "Queue a booking to fire at a specific release time. Writes a POSIX `at` job that self-invokes `restaurant book` with --yes when the window opens.",
        parameters: snipeSchema,
        async execute(_id, params) {
          const provider = resolveProvider(params["provider"] as string | undefined);
          if (typeof provider === "string") return err(provider);
          if (!provider.capabilities.snipe) {
            return err(`${provider.displayName} does not support sniping.`);
          }
          try {
            const runAt = parseReleaseAt(String(params["releaseAt"]));
            if (runAt.getTime() <= Date.now()) {
              return err(`releaseAt must be in the future. Got ${runAt.toISOString()}.`);
            }

            const bin = resolveCliBinary();
            const cmdParts = [
              shellQuote(bin),
              "book",
              "--venue",
              shellQuote(String(params["venueId"])),
              "--date",
              shellQuote(String(params["date"])),
              "--time",
              shellQuote(String(params["time"])),
              "--party",
              shellQuote(String(params["partySize"])),
              "--provider",
              shellQuote(provider.id),
              "--yes",
              "--json",
            ];
            const command = cmdParts.join(" ");
            const jobId = `snipe-${runAt.toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;

            const sched = createAtScheduler();
            await sched.schedule({
              id: jobId,
              command,
              runAt,
              providerId: provider.id,
              metadata: {
                venueId: String(params["venueId"]),
                date: String(params["date"]),
                time: String(params["time"]),
                partySize: Number(params["partySize"]),
              },
            });
            const row = (await sched.list()).find((j) => j.id === jobId);
            return okJson({
              jobId,
              atJobId: row?.metadata?.atJobId,
              runAt: runAt.toISOString(),
              logFile: sched.logFilePath(jobId),
            });
          } catch (e) {
            return err(e instanceof Error ? e.message : String(e));
          }
        },
      });

      // -- restaurant_list -------------------------------------------------
      api.registerTool({
        name: "restaurant_list",
        label: "List Reservations",
        description: "List reservations on the user's account.",
        parameters: listSchema,
        async execute(_id, params) {
          const provider = resolveProvider(params["provider"] as string | undefined);
          if (typeof provider === "string") return err(provider);
          if (!provider.capabilities.list) {
            return err(`${provider.displayName} does not support listing reservations.`);
          }
          try {
            const creds = credsFor(provider, api.pluginConfig);
            let rs = await provider.listReservations(creds);
            if (params["upcoming"]) {
              const today = new Date().toISOString().slice(0, 10);
              rs = rs.filter((r) => r.date >= today);
            }
            return okJson(rs);
          } catch (e) {
            return err(e instanceof Error ? e.message : String(e));
          }
        },
      });

      // -- restaurant_cancel -----------------------------------------------
      api.registerTool({
        name: "restaurant_cancel",
        label: "Cancel Reservation",
        description:
          "Cancel a reservation by id. DESTRUCTIVE — cancels immediately. Confirm with the user before invoking.",
        parameters: cancelSchema,
        async execute(_id, params) {
          const provider = resolveProvider(params["provider"] as string | undefined);
          if (typeof provider === "string") return err(provider);
          if (!provider.capabilities.cancel) {
            return err(`${provider.displayName} does not support cancel.`);
          }
          try {
            const creds = credsFor(provider, api.pluginConfig);
            const result = await provider.cancel(String(params["reservationId"]), creds);
            return okJson(result);
          } catch (e) {
            return err(e instanceof Error ? e.message : String(e));
          }
        },
      });
    },
  };
}

export default createOpenClawEntry;
