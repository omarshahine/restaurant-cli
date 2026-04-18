import { defineCommand } from "citty";
import { buildRegistry } from "../../providers/bootstrap.js";
import { loadConfig } from "../../core/config.js";
import { CapabilityError } from "../../core/errors.js";
import { credentialsFor } from "../credentials.js";
import { confirmTTY } from "../prompts.js";

export const bookCommand = defineCommand({
  meta: {
    name: "book",
    description: "Book a reservation (confirms with you before firing)",
  },
  args: {
    venue: { type: "string", description: "Venue id", required: true },
    date: { type: "string", description: "Date (YYYY-MM-DD)", required: true },
    time: { type: "string", description: "Time (HH:mm)", required: true },
    party: { type: "string", description: "Party size", default: "2" },
    provider: { type: "string", description: "Provider id", default: "" },
    "slot-token": {
      type: "string",
      description: "Skip the availability lookup by passing a token from `restaurant availability`",
      default: "",
    },
    notes: { type: "string", description: "Optional notes to send to the venue", default: "" },
    yes: { type: "boolean", description: "Skip confirmation prompt", default: false },
    json: { type: "boolean", description: "Output raw JSON result" },
  },
  async run({ args }) {
    const config = loadConfig();
    const registry = buildRegistry();
    const providerId = args.provider || config.defaults.provider;
    const provider = registry.get(providerId);
    if (!provider.capabilities.book) {
      throw new CapabilityError(provider.id, "book");
    }

    const creds = credentialsFor(providerId, config, provider);

    // Safety gate. Skipped only if --yes.
    if (!args.yes) {
      const ok = await confirmTTY(
        `Book ${providerId} venue ${args.venue} on ${args.date} at ${args.time} for party of ${args.party}?`,
      );
      if (!ok) {
        // eslint-disable-next-line no-console
        console.log("Aborted. No reservation was made.");
        return;
      }
    }

    const result = await provider.book(
      {
        venueId: args.venue,
        partySize: Number(args.party),
        date: args.date,
        time: args.time,
        ...(args["slot-token"] ? { slotToken: args["slot-token"] } : {}),
        ...(args.notes ? { notes: args.notes } : {}),
      },
      creds,
    );

    if (args.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error(`Booking failed: ${result.error ?? "unknown error"}`);
      process.exitCode = 4;
      return;
    }
    // eslint-disable-next-line no-console
    console.log(result.confirmationMessage ?? `Booked. reservationId=${result.reservationId}`);
  },
});
