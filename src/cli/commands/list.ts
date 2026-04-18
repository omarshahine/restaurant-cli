import { defineCommand } from "citty";
import { buildRegistry } from "../../providers/bootstrap.js";
import { loadConfig } from "../../core/config.js";
import { CapabilityError } from "../../core/errors.js";
import { credentialsFor } from "../credentials.js";

/** Today in the user's local calendar, as YYYY-MM-DD. */
function todayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "List your reservations",
  },
  args: {
    provider: { type: "string", description: "Provider id", default: "" },
    upcoming: { type: "boolean", description: "Only show future reservations", default: false },
    json: { type: "boolean", description: "Output raw JSON" },
  },
  async run({ args }) {
    const config = loadConfig();
    const registry = buildRegistry();
    const providerId = args.provider || config.defaults.provider;
    const provider = registry.get(providerId);
    if (!provider.capabilities.list) {
      throw new CapabilityError(provider.id, "list");
    }

    const creds = credentialsFor(providerId, config, provider);
    let reservations = await provider.listReservations(creds);

    if (args.upcoming) {
      const today = todayLocal();
      reservations = reservations.filter((r) => r.date >= today);
    }

    if (args.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(reservations, null, 2));
      return;
    }
    if (reservations.length === 0) {
      // eslint-disable-next-line no-console
      console.log(args.upcoming ? "No upcoming reservations." : "No reservations.");
      return;
    }
    for (const r of reservations) {
      const status = r.status ? `  (${r.status})` : "";
      // eslint-disable-next-line no-console
      console.log(
        `${r.date} ${r.time}  ${r.venueName}  party of ${r.partySize}${status}  [id: ${r.id}]`,
      );
    }
  },
});
