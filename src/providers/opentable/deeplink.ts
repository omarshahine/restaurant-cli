/**
 * OpenTable deep-link builder.
 *
 * Zero-maintenance hand-off path: generates a URL that opens opentable.com's
 * booking page with the venue, date/time, and party size pre-filled. The
 * user completes the booking themselves in their own browser. This is the
 * safety-first default for a provider that can't honestly complete bookings
 * programmatically.
 *
 * Pattern borrowed (not code) from mikehe123/opentable-reservations — the
 * "stop at the deep link, hand control back to the user" invariant.
 */

const BOOKING_BASE = "https://www.opentable.com/booking/experiences-availability";

export function buildBookingUrl(params: {
  restaurantId: string | number;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm (24h)
  partySize: number;
}): string {
  const qs = new URLSearchParams({
    rid: String(params.restaurantId),
    datetime: `${params.date}T${params.time}`,
    covers: String(params.partySize),
  });
  return `${BOOKING_BASE}?${qs.toString()}`;
}

/**
 * URL for a restaurant's profile page. Useful for surfacing in search
 * results so the user can preview before committing. Real slug pattern:
 * `https://www.opentable.com/r/<restaurant-slug>-<city-slug>`.
 */
export function buildProfileUrl(params: {
  citySlug?: string;
  restaurantSlug?: string;
  restaurantId: string | number;
}): string {
  if (params.restaurantSlug) {
    const suffix = params.citySlug ? `-${params.citySlug}` : "";
    return `https://www.opentable.com/r/${params.restaurantSlug}${suffix}`;
  }
  return `https://www.opentable.com/r/${params.restaurantId}`;
}
