import { defineCommand } from "citty";
import { buildRegistry } from "../../providers/bootstrap.js";
import { loadConfig } from "../../core/config.js";
import { CapabilityError } from "../../core/errors.js";
import { credentialsFor } from "../credentials.js";
import { AGENT_ARGS, emit, parseAgentArgs } from "../output.js";

export const availabilityCommand = defineCommand({
  meta: {
    name: "availability",
    description: "Show open time slots for a venue on a given date",
  },
  args: {
    venue: { type: "string", description: "Venue id (from `restaurant search`)", required: true },
    date: { type: "string", description: "Date (YYYY-MM-DD)", required: true },
    party: { type: "string", description: "Party size", default: "2" },
    provider: { type: "string", description: "Provider id", default: "" },
    ...AGENT_ARGS,
  },
  async run({ args }) {
    const agentArgs = parseAgentArgs(args as unknown as Record<string, unknown>);
    const config = loadConfig();
    const registry = buildRegistry();
    const providerId = args.provider || config.defaults.provider;
    const provider = registry.get(providerId);
    if (!provider.capabilities.availability) {
      throw new CapabilityError(provider.id, "availability");
    }

    const creds = credentialsFor(providerId, config, provider);
    const slots = await provider.getAvailability(
      { venueId: args.venue, date: args.date, partySize: Number(args.party) },
      creds,
    );

    emit(slots, agentArgs, {
      empty: `No availability for venue ${args.venue} on ${args.date} for party of ${args.party}.`,
      human: (xs) =>
        xs.map((s) => {
          const type = s.type ? `  [${s.type}]` : "";
          return `${s.time}${type}  token=${s.token}`;
        }),
    });
  },
});
