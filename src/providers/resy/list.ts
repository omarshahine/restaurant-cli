import type { Credentials, Reservation } from "../types.js";
import { ProviderError } from "../../core/errors.js";
import { ResyClient } from "./client.js";
import { resyCredentials } from "./auth.js";
import { parseResyTime } from "./availability.js";

/**
 * Resy /3/user/reservations response shape (confirmed against a real
 * authenticated account, 2026-04-17).
 *
 * see resy-cli: internal/resy/reservations.go
 *
 * Gotchas we learned from the real payload:
 *   - `venue` only carries `{id, currency}` — the **name is NOT in the venue
 *     object**. It's embedded in `share.generic_message` as e.g.
 *     "Please RSVP for Nishino on January 18 at 5:30PM". We regex it out.
 *   - `time_slot` is a bare string like "17:30:00" (venue-local), not an object.
 *   - `when` is a UTC datetime ("2026-01-19 01:30:00") — useful if we ever need
 *     the venue's timezone, but for display we prefer `day` + `time_slot`.
 *   - `status` is `{finished: 0|1, no_show: 0|1}` — not a readable string.
 *   - Older Resy docs/tools referenced `time_slot.date` + `venue.name` as
 *     objects; we still tolerate that shape for forward compatibility.
 */
interface ResyReservationsResponse {
  reservations?: ResyReservationRaw[];
  results?: { reservations?: ResyReservationRaw[] };
}

interface ResyShare {
  generic_message?: string;
  message?: Array<{ title?: string; body?: string }>;
}

interface ResyReservationRaw {
  resy_token?: string;
  reservation_id?: number | string;
  day?: string;
  num_seats?: number;
  venue?: { id?: number | string; name?: string };
  /** Modern Resy: bare "HH:MM:SS" string. Legacy: `{date: "YYYY-MM-DD HH:MM:SS"}`. */
  time_slot?: string | { date?: string };
  /** UTC datetime string, modern Resy only. */
  when?: string;
  date?: { start?: string };
  status?: { reservation?: string; finished?: number; no_show?: number } | string;
  share?: ResyShare;
}

/**
 * Extract the venue name from `share.generic_message` or `share.message[*].title`.
 * Resy uses two consistent phrasings:
 *   - "Please RSVP for <NAME> on <DATE> at <TIME>"     ← generic_message
 *   - "RSVP for our Reservation at <NAME>"             ← message[*].title
 * Returns empty string if nothing matches.
 */
export function extractVenueNameFromShare(share: ResyShare | undefined): string {
  if (!share) return "";
  const pool: string[] = [];
  if (share.generic_message) pool.push(share.generic_message);
  for (const m of share.message ?? []) {
    if (m.title) pool.push(m.title);
    if (m.body) pool.push(m.body);
  }
  // Try the stronger anchor first (end-of-string "Reservation at X") since
  // the RSVP phrasing would otherwise shadow it when both appear in the pool.
  for (const s of pool) {
    const m = /Reservation at\s+(.+?)\s*$/i.exec(s);
    if (m?.[1]) return m[1].trim();
  }
  for (const s of pool) {
    const m = /RSVP for\s+(.+?)\s+on\b/i.exec(s);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

/**
 * Pure parser. Extracted so tests can pin the shape without nock.
 */
export function parseReservationsResponse(raw: unknown): Reservation[] {
  const r = (raw ?? {}) as ResyReservationsResponse;
  const rows = r.reservations ?? r.results?.reservations ?? [];
  const out: Reservation[] = [];
  for (const row of rows) {
    const id =
      row.resy_token ??
      (row.reservation_id !== undefined ? String(row.reservation_id) : undefined);
    if (!id) continue;

    const venueId = row.venue?.id !== undefined ? String(row.venue.id) : "";
    // Modern payloads carry no `venue.name`; fall back to parsing it out of
    // the share message. Keeps the human-readable list actually readable.
    const venueName = row.venue?.name ?? extractVenueNameFromShare(row.share);

    // `time_slot` is a bare "HH:MM:SS" string in modern Resy but an object in
    // older payloads — support both.
    let timeSource = "";
    if (typeof row.time_slot === "string") timeSource = row.time_slot;
    else if (row.time_slot?.date) timeSource = row.time_slot.date;
    else if (row.date?.start) timeSource = row.date.start;
    const time = timeSource ? parseResyTime(timeSource) : "";

    // `day` is present in modern payloads. Fall back to slicing the legacy
    // datetime string.
    const legacyDate = (typeof row.time_slot === "object" && row.time_slot?.date) || row.date?.start || "";
    const day = row.day ?? (legacyDate ? legacyDate.slice(0, 10) : "");

    // Status shape varies. A freeform string is most useful for users.
    let statusStr: string | undefined;
    if (typeof row.status === "string") statusStr = row.status;
    else if (row.status?.reservation) statusStr = row.status.reservation;
    else if (row.status?.finished === 1) statusStr = "Completed";

    out.push({
      id,
      venueName,
      venueId,
      date: day,
      time,
      partySize: row.num_seats ?? 0,
      ...(statusStr ? { status: statusStr } : {}),
      raw: row,
    });
  }
  return out;
}

/**
 * Filter out reservations whose date is before the local calendar day. The
 * Resy API often returns recent history alongside upcoming; callers can opt
 * out via `includePast`.
 */
export function filterUpcoming(reservations: Reservation[], today: string): Reservation[] {
  return reservations.filter((r) => r.date >= today);
}

export async function listReservations(creds: Credentials): Promise<Reservation[]> {
  const client = new ResyClient(resyCredentials(creds));
  let raw: unknown;
  try {
    raw = await client.listReservations();
  } catch (e) {
    throw new ProviderError(
      `Resy reservations lookup failed: ${(e as Error).message}`,
      "resy",
    );
  }
  return parseReservationsResponse(raw);
}
