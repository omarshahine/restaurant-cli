import { defineCommand } from "citty";
import { buildRegistry } from "../../providers/bootstrap.js";
import { loadConfig } from "../../core/config.js";
import { CapabilityError } from "../../core/errors.js";
import { credentialsFor } from "../credentials.js";
import { confirmTTY } from "../prompts.js";
import { AGENT_ARGS, emit, emitError, parseAgentArgs } from "../output.js";
import type { BookResult, Reservation } from "../../providers/types.js";

/**
 * Reservation statuses we treat as "dead" — a match against one of these
 * during idempotency check is NOT a duplicate booking and should be ignored.
 * Includes Resy's "cancelled" and the generic "canceled" spelling, plus
 * "expired"/"refunded" which some providers emit for past or refunded
 * reservations. Comparison is case-insensitive.
 */
const DEAD_RESERVATION_STATUSES = new Set([
  "cancelled",
  "canceled",
  "expired",
  "refunded",
  "noshow",
  "no-show",
  "no_show",
  "void",
  "voided",
]);

function isLive(r: Reservation): boolean {
  if (!r.status) return true; // No status field → assume live.
  return !DEAD_RESERVATION_STATUSES.has(r.status.toLowerCase().replace(/\s+/g, ""));
}

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
    idempotent: {
      type: "boolean",
      description:
        "If a matching reservation already exists, return it instead of double-booking",
      default: false,
    },
    ...AGENT_ARGS,
  },
  async run({ args }) {
    const agentArgs = parseAgentArgs(args as unknown as Record<string, unknown>);
    const config = loadConfig();
    const registry = buildRegistry();
    const providerId = args.provider || config.defaults.provider;
    const provider = registry.get(providerId);
    if (!provider.capabilities.book) {
      throw new CapabilityError(provider.id, "book");
    }

    const creds = credentialsFor(providerId, config, provider);
    const partySize = Number(args.party);

    const bookRequest = {
      venueId: args.venue,
      partySize,
      date: args.date,
      time: args.time,
      ...(args["slot-token"] ? { slotToken: args["slot-token"] } : {}),
      ...(args.notes ? { notes: args.notes } : {}),
    };

    // Idempotency: scan existing LIVE reservations only. A cancelled/expired
    // reservation at the same (venue, date, time, party) coordinates is not a
    // duplicate — the user genuinely wants to re-book. This matters most for
    // the snipe fire-time path, which auto-passes --idempotent.
    if (args.idempotent && provider.capabilities.list) {
      try {
        const existing = await provider.listReservations(creds);
        const match = existing.find(
          (r) =>
            isLive(r) &&
            r.venueId === args.venue &&
            r.date === args.date &&
            r.time === args.time &&
            r.partySize === partySize,
        );
        if (match) {
          const result: BookResult = {
            ok: true,
            reservationId: match.id,
            confirmationMessage: `Already booked (idempotent match): ${match.id}`,
            raw: { idempotent: true, existing: match },
          };
          emit(result, agentArgs, {
            human: () => result.confirmationMessage ?? `Booked. reservationId=${result.reservationId}`,
          });
          return;
        }
      } catch {
        // List failure shouldn't block book — proceed.
      }
    }

    // Dry-run: print the would-fire envelope, never call book.
    if (agentArgs.dryRun) {
      const envelope = {
        ok: true,
        dryRun: true,
        provider: providerId,
        request: bookRequest,
      };
      emit(envelope, agentArgs, {
        human: () =>
          `DRY RUN — would book ${providerId} venue ${args.venue} on ${args.date} at ${args.time} for party of ${partySize}`,
      });
      return;
    }

    // Safety gate. Skipped only if --yes / --agent.
    if (!agentArgs.yes) {
      const ok = await confirmTTY(
        `Book ${providerId} venue ${args.venue} on ${args.date} at ${args.time} for party of ${partySize}?`,
        { noInput: agentArgs.noInput },
      );
      if (!ok) {
        process.stdout.write("Aborted. No reservation was made.\n");
        return;
      }
    }

    // Reached only after the y/N gate above (or --yes). Stamp the hard
    // confirmation flag here so the provider's destructive call can't fire
    // without having passed a confirmation step.
    const result = await provider.book({ ...bookRequest, confirmed: true }, creds);

    if (!result.ok) {
      // 3 = not_found if Resy says "no slot"; otherwise 5 = api error.
      const code = /no slot|not found|404/i.test(result.error ?? "") ? "not_found" : "provider";
      emitError(`Booking failed: ${result.error ?? "unknown error"}`, agentArgs, {
        code,
        exitCode: code === "not_found" ? 3 : 5,
      });
      return;
    }
    emit(result, agentArgs, {
      human: () => result.confirmationMessage ?? `Booked. reservationId=${result.reservationId}`,
    });
  },
});
