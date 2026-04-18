import { defineCommand } from "citty";
import { buildRegistry } from "../../providers/bootstrap.js";
import { loadConfig } from "../../core/config.js";
import { CapabilityError } from "../../core/errors.js";
import { credentialsFor } from "../credentials.js";

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
    json: { type: "boolean", description: "Output raw JSON" },
  },
  async run({ args }) {
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

    if (args.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(slots, null, 2));
      return;
    }
    if (slots.length === 0) {
      // eslint-disable-next-line no-console
      console.log(
        `No availability for venue ${args.venue} on ${args.date} for party of ${args.party}.`,
      );
      return;
    }
    for (const s of slots) {
      const type = s.type ? `  [${s.type}]` : "";
      // eslint-disable-next-line no-console
      console.log(`${s.time}${type}  token=${s.token}`);
    }
  },
});

