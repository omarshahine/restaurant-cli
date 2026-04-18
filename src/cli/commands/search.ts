import { defineCommand } from "citty";
import { buildRegistry } from "../../providers/bootstrap.js";
import { loadConfig } from "../../core/config.js";
import { CapabilityError } from "../../core/errors.js";
import { credentialsFor } from "../credentials.js";

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

