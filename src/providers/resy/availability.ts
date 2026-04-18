import type { AvailabilityQuery, Credentials, Slot } from "../types.js";
import { ProviderError } from "../../core/errors.js";
import { ResyClient } from "./client.js";
import { resyCredentials } from "./auth.js";

/**
 * Resy /4/find response shape.
 *
 * see resy-cli: internal/resy/find.go — same endpoint, different language.
 *
 * The structure we care about:
 *   results.venues[].slots[].config.token   → opaque booking token (`config_id` in /3/details)
 *   results.venues[].slots[].config.type    → "Dining Room", "Bar", etc.
 *   results.venues[].slots[].date.start     → "YYYY-MM-DD HH:MM:SS" local to the venue
 *
 * We ignore size/payment/cancellation metadata on the slot for M2; the raw
 * slot object is preserved on Slot.raw so a future capability (e.g. prepaid
 * filtering) can reach into it without another fetch.
 */
interface ResyFindHit {
  venue?: { id?: { resy?: number | string }; name?: string };
  slots?: ResyFindSlot[];
}

interface ResyFindSlot {
  date?: { start?: string; end?: string };
  config?: { id?: string | number; token?: string; type?: string };
}

interface ResyFindResponse {
  results?: { venues?: ResyFindHit[] };
}

/**
 * Pull just the `HH:mm` out of a Resy date string like "2026-05-15 19:00:00".
 * Returns the original string if we can't parse it — the caller can still
 * surface it to the user, just without normalization.
 */
export function parseResyTime(s: string): string {
  const m = /\b(\d{2}):(\d{2})(?::\d{2})?\b/.exec(s);
  return m ? `${m[1]}:${m[2]}` : s;
}

/**
 * Pure parser. Accepts the raw JSON from `/4/find` and returns Slot[]. Split
 * out from `getAvailability` so tests can pin the shape without nock.
 */
export function parseAvailabilityResponse(raw: unknown): Slot[] {
  const r = (raw ?? {}) as ResyFindResponse;
  const venues = r.results?.venues ?? [];
  const slots: Slot[] = [];
  for (const v of venues) {
    for (const s of v.slots ?? []) {
      const token = s.config?.token;
      const startRaw = s.date?.start;
      if (!token || !startRaw) continue;
      const slot: Slot = {
        token,
        time: parseResyTime(startRaw),
        ...(s.config?.id !== undefined ? { configId: String(s.config.id) } : {}),
        ...(s.config?.type ? { type: s.config.type } : {}),
        raw: s,
      };
      slots.push(slot);
    }
  }
  return slots;
}

/**
 * Hit Resy's /4/find for a given venue/date/party and return Slot[] with the
 * `token` each slot carries — that token is the `config_id` the `/3/details`
 * step of `book` needs.
 */
export async function getAvailability(
  q: AvailabilityQuery,
  creds: Credentials,
): Promise<Slot[]> {
  const client = new ResyClient(resyCredentials(creds));
  let raw: unknown;
  try {
    raw = await client.getAvailability({
      venueId: q.venueId,
      date: q.date,
      partySize: q.partySize,
    });
  } catch (e) {
    // Let 4xx/5xx bubble through with a useful provider-branded message.
    throw new ProviderError(
      `Resy availability lookup failed: ${(e as Error).message}`,
      "resy",
    );
  }
  return parseAvailabilityResponse(raw);
}
