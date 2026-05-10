/**
 * `restaurant earliest <venue,venue,...> --within 14d --party 2`
 *
 * For each venue in the input list, scans the next N days across every
 * availability-capable provider in parallel and returns the soonest open
 * slot per venue. The companion command to multi-provider `search`: useful
 * when you have a shortlist and want the soonest opportunity, without
 * picking a date up front.
 *
 * Inspired by table-reservation-goat's `earliest` command but reuses the
 * existing provider registry so any provider with `capabilities.availability`
 * participates automatically (Resy + OpenTable today, Tock tomorrow).
 */

import { defineCommand } from "citty";
import { buildRegistry } from "../../providers/bootstrap.js";
import { loadConfig } from "../../core/config.js";
import { UsageError } from "../../core/errors.js";
import { credentialsFor } from "../credentials.js";
import { AGENT_ARGS, emit, parseAgentArgs } from "../output.js";
import type { Slot } from "../../providers/types.js";

interface EarliestRow {
  venue: string;
  provider: string;
  date: string;
  time: string;
  token: string;
  type?: string;
}

/**
 * Parse a `--within` value into a day count. Accepts `14d`, `7d`, `30d`, or
 * a bare integer.
 */
export function parseWithinDays(s: string): number {
  const m = /^(\d+)(d)?$/i.exec(s.trim());
  if (!m) throw new UsageError(`--within must be like '14d' or a bare integer of days (got: ${s})`);
  const n = Number(m[1]);
  if (n < 1 || n > 60) {
    throw new UsageError(`--within must be 1..60 days (got: ${n})`);
  }
  return n;
}

function addDays(yyyymmdd: string, days: number): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function todayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export const earliestCommand = defineCommand({
  meta: {
    name: "earliest",
    description:
      "Soonest open slot per venue across all providers (e.g. earliest carbone-new-york,alinea-tasting --within 14d)",
  },
  args: {
    venues: {
      type: "positional",
      description:
        "Comma-separated venue ids. Bare ids resolve against every provider; prefix `<provider>:<id>` to scope to one (e.g. resy:1387,opentable:8033).",
      required: true,
    },
    within: { type: "string", description: "Search horizon (e.g. 14d)", default: "14d" },
    party: { type: "string", description: "Party size", default: "2" },
    "start-date": {
      type: "string",
      description: "Start of window (YYYY-MM-DD); defaults to today",
      default: "",
    },
    ...AGENT_ARGS,
  },
  async run({ args }) {
    const agentArgs = parseAgentArgs(args as unknown as Record<string, unknown>);
    const config = loadConfig();
    const registry = buildRegistry();
    const days = parseWithinDays(String(args.within));
    const start = String(args["start-date"] || todayLocal());
    const partySize = Number(args.party);

    const items = String(args.venues)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) throw new UsageError("Provide at least one venue id");

    type Target = { providerId: string | null; venueId: string };
    const targets: Target[] = items.map((item) => {
      const colon = item.indexOf(":");
      if (colon > 0) {
        return { providerId: item.slice(0, colon), venueId: item.slice(colon + 1) };
      }
      return { providerId: null, venueId: item };
    });

    const availabilityProviders = registry.list().filter((p) => p.capabilities.availability);

    /**
     * For a single (provider, venue) pair, walk forward day by day until we
     * find a slot or exhaust the window. Stops on first slot to avoid
     * hammering the provider beyond what `earliest` needs.
     */
    async function scanOne(providerId: string, venueId: string): Promise<EarliestRow | null> {
      const provider = registry.tryGet(providerId);
      if (!provider || !provider.capabilities.availability) return null;
      const creds = credentialsFor(providerId, config, provider);
      for (let i = 0; i < days; i++) {
        const date = addDays(start, i);
        try {
          const slots: Slot[] = await provider.getAvailability(
            { venueId, date, partySize },
            creds,
          );
          if (slots.length > 0) {
            // Pick the earliest time on the earliest day.
            const sorted = [...slots].sort((a, b) => a.time.localeCompare(b.time));
            const first = sorted[0]!;
            return {
              venue: venueId,
              provider: providerId,
              date,
              time: first.time,
              token: first.token,
              ...(first.type ? { type: first.type } : {}),
            };
          }
        } catch {
          // Per-day errors are fine; just try the next day. The whole-venue
          // failure mode is "no slots found in window".
        }
      }
      return null;
    }

    const workItems: { providerId: string; venueId: string }[] = [];
    for (const t of targets) {
      if (t.providerId) {
        workItems.push({ providerId: t.providerId, venueId: t.venueId });
      } else {
        for (const p of availabilityProviders) {
          workItems.push({ providerId: p.id, venueId: t.venueId });
        }
      }
    }

    const results = await Promise.all(
      workItems.map((w) => scanOne(w.providerId, w.venueId).catch(() => null)),
    );

    // Group by venueId, pick the earliest hit per venue across providers.
    const byVenue = new Map<string, EarliestRow>();
    for (const r of results) {
      if (!r) continue;
      const key = r.venue;
      const cur = byVenue.get(key);
      if (!cur) {
        byVenue.set(key, r);
        continue;
      }
      // Earlier date wins; if same date, earlier time wins.
      if (r.date < cur.date || (r.date === cur.date && r.time < cur.time)) {
        byVenue.set(key, r);
      }
    }

    const rows = [...byVenue.values()].sort((a, b) =>
      a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date),
    );

    emit(rows, agentArgs, {
      empty: "No availability found within the window.",
      human: (xs) =>
        xs.map(
          (r) =>
            `${r.date} ${r.time}  ${r.venue}  [${r.provider}]${r.type ? `  (${r.type})` : ""}  token=${r.token}`,
        ),
    });
  },
});
