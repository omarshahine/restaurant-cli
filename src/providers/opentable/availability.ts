import type { AvailabilityQuery, Credentials, Slot } from "../types.js";
import { OpenTableClient } from "./client.js";
import { buildBookingUrl } from "./deeplink.js";

interface DapiAvailabilityResponse {
  availability?: {
    times?: Array<{
      dateTime?: string; // "2026-05-01T19:00"
      time?: string; // "19:00"
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
 * Available time slots for an OpenTable restaurant on a given date.
 *
 * The response shape varies between the anonymous/public form and the
 * logged-in form; we normalize to the shared `Slot` type. Because OpenTable
 * can't be booked via this client, each slot carries a `token` that is
 * actually a pre-built booking URL. The caller can pass it to
 * `getBookingUrl` or open it directly.
 */
export async function getAvailability(
  q: AvailabilityQuery,
  _creds: Credentials,
): Promise<Slot[]> {
  const client = new OpenTableClient();
  // OpenTable's dapi wants ISO local time; we seed the request with the
  // user's requested date at the conventional 19:00 anchor and let their
  // server decide which actual slots to surface for that day.
  const dateTime = `${q.date}T19:00`;
  const raw = (await client.getAvailability({
    restaurantId: q.venueId,
    dateTime,
    partySize: q.partySize,
  })) as DapiAvailabilityResponse;

  const times = raw?.availability?.times ?? raw?.times ?? [];
  return times
    .filter((t) => t.available !== false && (t.time || t.dateTime))
    .map((t): Slot => {
      const time = t.time ?? (t.dateTime ?? "").slice(11, 16);
      return {
        token: buildBookingUrl({
          restaurantId: q.venueId,
          date: q.date,
          time,
          partySize: q.partySize,
        }),
        time,
        ...(t.slotHash ? { configId: t.slotHash } : {}),
        ...(t.attributes?.category ? { type: t.attributes.category } : {}),
        raw: t,
      };
    });
}
