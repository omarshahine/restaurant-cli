import { defineCommand } from "citty";
import { buildRegistry } from "../../providers/bootstrap.js";
import { loadConfig } from "../../core/config.js";
import { CapabilityError } from "../../core/errors.js";
import { credentialsFor } from "../credentials.js";
import { AGENT_ARGS, emit, parseAgentArgs } from "../output.js";

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
    ...AGENT_ARGS,
  },
  async run({ args }) {
    const agentArgs = parseAgentArgs(args as unknown as Record<string, unknown>);
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

    emit(reservations, agentArgs, {
      empty: args.upcoming ? "No upcoming reservations." : "No reservations.",
      human: (xs) =>
        xs.map((r) => {
          const status = r.status ? `  (${r.status})` : "";
          return `${r.date} ${r.time}  ${r.venueName}  party of ${r.partySize}${status}  [id: ${r.id}]`;
        }),
    });
  },
});
