import { defineCommand } from "citty";
import { buildRegistry } from "../../providers/bootstrap.js";
import { loadConfig } from "../../core/config.js";
import { CapabilityError } from "../../core/errors.js";
import { credentialsFor } from "../credentials.js";
import { AGENT_ARGS, emit, parseAgentArgs } from "../output.js";
import type { Venue } from "../../providers/types.js";

/**
 * Venue search.
 *
 * Default behavior: fan out across every registered provider with
 * `capabilities.search` and merge results. Pass `--provider <id>` to scope
 * to one provider (legacy single-provider behavior).
 *
 * Annotation: read-only — safe for agent autorun.
 */
export const searchCommand = defineCommand({
  meta: {
    name: "search",
    description:
      "Search venues. Default fans out across all providers; --provider scopes to one.",
  },
  args: {
    query: { type: "positional", description: "Search query", required: true },
    provider: {
      type: "string",
      description: "Provider id (omit to search every registered provider)",
      default: "",
    },
    city: { type: "string", description: "City filter (provider-specific slug, e.g. ny)" },
    limit: { type: "string", description: "Max results per provider (default 10)", default: "10" },
    ...AGENT_ARGS,
  },
  async run({ args }) {
    const agentArgs = parseAgentArgs(args as unknown as Record<string, unknown>);
    const config = loadConfig();
    const registry = buildRegistry();

    const targets = args.provider
      ? [registry.get(args.provider)]
      : registry.list().filter((p) => p.capabilities.search);

    if (targets.length === 0) {
      throw new CapabilityError(args.provider || "(any)", "search");
    }

    const limit = Number(args.limit);
    const cityFilter = args.city ? { city: args.city } : {};

    const settled = await Promise.allSettled(
      targets.map(async (p) => {
        if (!p.capabilities.search) {
          throw new CapabilityError(p.id, "search");
        }
        const creds = credentialsFor(p.id, config, p);
        const venues = await p.searchVenues(
          { query: args.query, ...cityFilter, limit },
          creds,
        );
        return venues.map((v) => ({ ...v, provider: p.id }));
      }),
    );

    type Hit = Venue & { provider: string };
    const merged: Hit[] = [];
    const failures: { provider: string; error: string }[] = [];
    settled.forEach((res, i) => {
      const provider = targets[i]!.id;
      if (res.status === "fulfilled") {
        merged.push(...(res.value as Hit[]));
      } else {
        failures.push({ provider, error: (res.reason as Error).message });
      }
    });

    // Rank: case-insensitive substring score against query, then by provider
    // preference (resy > opentable > tock, configurable via defaults).
    const q = args.query.toLowerCase();
    const providerOrder = new Map(
      registry.list().map((p, i) => [p.id, i]),
    );
    merged.sort((a, b) => {
      const aHas = a.name.toLowerCase().includes(q) ? 0 : 1;
      const bHas = b.name.toLowerCase().includes(q) ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      const ap = providerOrder.get(a.provider) ?? 99;
      const bp = providerOrder.get(b.provider) ?? 99;
      return ap - bp;
    });

    // In --json/--csv mode, surface per-provider failures alongside the
    // hits so agents can distinguish "no results" from "provider blocked".
    // Previously the failures array was visible only in human mode, which
    // turned a Cloudflare 403 into a silent empty result for agents.
    if (agentArgs.json || agentArgs.csv) {
      const envelope = {
        ok: failures.length === 0,
        query: args.query,
        results: merged,
        failures,
      };
      emit(envelope, agentArgs);
      return;
    }

    emit(merged, agentArgs, {
      empty: `No venues found for "${args.query}".`,
      human: (venues) => {
        const lines: string[] = [];
        for (const v of venues) {
          const loc = [v.city, v.region].filter(Boolean).join(", ");
          const prov = `[${v.provider}]`.padEnd(11);
          lines.push(`${prov} ${v.name}${loc ? `  (${loc})` : ""}  [id: ${v.id}]`);
        }
        for (const f of failures) {
          lines.push(`# ${f.provider}: ${f.error}`);
        }
        return lines;
      },
    });
  },
});
