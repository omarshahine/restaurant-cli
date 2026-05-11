/**
 * Tock search — shell-out to trg's `restaurants list --network tock`.
 * Returns the matching venues; the trg side handles Cloudflare/TLS for us.
 *
 * The provider-agnostic `Venue` shape is a narrower projection; we drop
 * latitude/longitude/match_score from the surface but preserve them on
 * `raw` so power users / future code can reach in.
 */

import type { Credentials, Venue, VenueQuery } from "../types.js";
import { trgRestaurantsList, type TrgRestaurant } from "./trg.js";

export function trgRestaurantToVenue(r: TrgRestaurant): Venue {
  return {
    id: r.slug,
    name: r.name,
    ...(r.metro ? { city: r.metro } : {}),
    ...(r.cuisine ? { cuisine: r.cuisine } : {}),
    ...(r.url ? { url: r.url } : {}),
    raw: r,
  };
}

export async function searchVenues(
  q: VenueQuery,
  _creds: Credentials,
): Promise<Venue[]> {
  const env = await trgRestaurantsList(q.query, q.limit ?? 20);
  return env.results.map(trgRestaurantToVenue);
}
