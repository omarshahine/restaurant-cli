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
 *
 * LIVE NOTE (verified 2026-04-18 via patchright probe of rid=1046758,
 * issue #16): the older `/booking/experiences-availability?rid=...&datetime=...`
 * shape has been retired and now returns HTTP 400. The legacy affiliate
 * URL `/restref/client?rid=X&restref=X&partysize=N&datetime=ISO` still
 * works: OpenTable 302s it to `/booking/restref/availability?...` with a
 * fresh `correlationId` and renders the time-slot picker ("OpenTable -
 * Complete your reservation"). We keep that shape here.
 */

const BOOKING_BASE = "https://www.opentable.com/restref/client";

export function buildBookingUrl(params: {
  restaurantId: string | number;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm (24h)
  partySize: number;
}): string {
  // The lowercase param names (`rid`, `restref`, `partysize`, `datetime`)
  // are what `/restref/client` accepts; OpenTable internally redirects to
  // the camelCase `restRef` / `partySize` / `dateTime` on the target page.
  const qs = new URLSearchParams({
    rid: String(params.restaurantId),
    restref: String(params.restaurantId),
    partysize: String(params.partySize),
    datetime: `${params.date}T${params.time}`,
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
