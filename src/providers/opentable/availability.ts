import type { AvailabilityQuery, Credentials, Slot } from "../types.js";
import { OpenTableClient } from "./client.js";
import { buildBookingUrl } from "./deeplink.js";

interface DapiAvailabilityResponse {
  availability?: {
    times?: Array<{
      dateTime?: string;
      time?: string;
      slotHash?: string;
      available?: boolean;
      attributes?: { category?: string };
    }>;
  };
  times?: Array<{
    dateTime?: string;
    time?: string;
    slotHash?: string;
    available?: boolean;
    attributes?: { category?: string };
  }>;
}

/**
 * Pure parser: `/dapi/booking/restaurant/{rid}/availability` → Slot[]. Kept
 * independent of the HTTP transport so a browser-automation fetcher (CDP)
 * can feed the same JSON shape through this function.
 */
export function parseAvailabilityResponse(
  raw: unknown,
  ctx: { venueId: string; date: string; partySize: number },
): Slot[] {
  const r = raw as DapiAvailabilityResponse;
  const times = r?.availability?.times ?? r?.times ?? [];
  return times
    .filter((t) => t.available !== false && (t.time || t.dateTime))
    .map((t): Slot => {
      const time = t.time ?? (t.dateTime ?? "").slice(11, 16);
      return {
        token: buildBookingUrl({
          restaurantId: ctx.venueId,
          date: ctx.date,
          time,
          partySize: ctx.partySize,
        }),
        time,
        ...(t.slotHash ? { configId: t.slotHash } : {}),
        ...(t.attributes?.category ? { type: t.attributes.category } : {}),
        raw: t,
      };
    });
}

/**
 * Live availability. Not wired into the Provider surface because the HTTP
 * transport is blocked by Akamai. Parsers are split out above so the
 * browser-backed milestone can reuse them.
 */
export async function getAvailability(
  q: AvailabilityQuery,
  _creds: Credentials,
): Promise<Slot[]> {
  const client = new OpenTableClient();
  const dateTime = `${q.date}T19:00`;
  const raw = await client.getAvailability({
    restaurantId: q.venueId,
    dateTime,
    partySize: q.partySize,
  });
  return parseAvailabilityResponse(raw, {
    venueId: q.venueId,
    date: q.date,
    partySize: q.partySize,
  });
}
