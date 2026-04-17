import { defineCommand } from "citty";
import { buildRegistry } from "../../providers/bootstrap.js";
import { loadConfig } from "../../core/config.js";
import { resolveSecret } from "../../core/secrets.js";
import { AuthError, CapabilityError } from "../../core/errors.js";
import type { Credentials } from "../../providers/types.js";

export const searchCommand = defineCommand({
  meta: {
    name: "search",
    description: "Search for venues by name",
  },
  args: {
    query: { type: "positional", description: "Search query", required: true },
    provider: { type: "string", description: "Provider id", default: "" },
    city: { type: "string", description: "City filter (provider-specific slug, e.g. ny)" },
    limit: { type: "string", description: "Max results (default 10)", default: "10" },
    json: { type: "boolean", description: "Output raw JSON" },
  },
  async run({ args }) {
    const config = loadConfig();
    const registry = buildRegistry();
    const providerId = args.provider || config.defaults.provider;
    const provider = registry.get(providerId);
    if (!provider.capabilities.search) {
      throw new CapabilityError(provider.id, "search");
    }

    const creds = credentialsFor(providerId, config, provider);
    const venues = await provider.searchVenues(
      { query: args.query, ...(args.city ? { city: args.city } : {}), limit: Number(args.limit) },
      creds,
    );

    if (args.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(venues, null, 2));
      return;
    }
    if (venues.length === 0) {
      // eslint-disable-next-line no-console
      console.log(`No venues found for "${args.query}".`);
      return;
    }
    for (const v of venues) {
      const loc = [v.city, v.region].filter(Boolean).join(", ");
      // eslint-disable-next-line no-console
      console.log(`${v.name}${loc ? `  (${loc})` : ""}  [id: ${v.id}]`);
    }
  },
});

function credentialsFor(
  providerId: string,
  config: ReturnType<typeof loadConfig>,
  provider: { auth: { setupPrompts(): Array<unknown> } },
): Credentials {
  const pc = config.providers[providerId];
  const needsConfig = provider.auth.setupPrompts().length > 0;
  if (!pc && needsConfig) {
    throw new AuthError(
      `No config for provider "${providerId}". Run: restaurant setup ${providerId}`,
    );
  }

  const creds: Credentials = {};
  for (const [k, v] of Object.entries(pc ?? {})) {
    if (k === "tokenRef" || k === "token") continue;
    if (typeof v === "string") creds[k] = v;
  }

  // Resy wants apiKey + authToken. We store the auth token via tokenRef by
  // convention; pull it into `authToken` so the provider's auth.ts can read
  // it uniformly. If the provider stores multiple sensitive keys, config can
  // express them via additional *Ref entries.
  const tokenRef = pc?.tokenRef;
  const token = pc?.token;
  const resolved = resolveSecret(tokenRef) ?? resolveSecret(token) ?? undefined;
  if (resolved) creds["authToken"] = resolved;

  return creds;
}
