import type { AvailabilityQuery, Credentials, Slot } from "../types.js";
import { trgAvailabilityCheck, type TrgAvailabilityResult } from "./trg.js";

/**
 * Parse trg's `bookable_times` (ISO local "YYYY-MM-DDTHH:MM") into our
 * provider-agnostic Slot shape. Exposed for unit tests.
 *
 * Token shape: `<date>|<HH:MM>|tock:<slug>`. Tock's book flow is gated by
 * URL-encoded params (slug + date + time + size), not an opaque slot token
 * like Resy's `config.token`, so we synthesize a deterministic composite
 * that callers can hand back to a future book implementation.
 */
export function bookableTimesToSlots(
  result: TrgAvailabilityResult,
  date: string,
  venueSlug: string,
): Slot[] {
  if (!result.available || !result.bookable_times) return [];
  const out: Slot[] = [];
  for (const iso of result.bookable_times) {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso);
    if (!m) continue;
    const slotDate = m[1]!;
    const time = `${m[2]}:${m[3]}`;
    if (slotDate !== date) continue; // multi-day envelopes can leak adjacent dates
    out.push({
      token: `${slotDate}|${time}|tock:${venueSlug}`,
      time,
      raw: { iso, slug: venueSlug },
    });
  }
  out.sort((a, b) => a.time.localeCompare(b.time));
  return out;
}

export async function getAvailability(
  q: AvailabilityQuery,
  _creds: Credentials,
): Promise<Slot[]> {
  const result = await trgAvailabilityCheck(q.venueId, q.date, q.partySize);
  return bookableTimesToSlots(result, q.date, q.venueId);
}
