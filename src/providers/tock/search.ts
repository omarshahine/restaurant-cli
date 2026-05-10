import type { Credentials, Venue, VenueQuery } from "../types.js";
import { TockClient } from "./client.js";
import { tockCredentials } from "./auth.js";

interface TockSearchHit {
  id?: string | number;
  businessSlug?: string;
  name?: string;
  city?: { name?: string };
  region?: { name?: string };
  cuisines?: string[];
  url?: string;
}

interface TockSearchResponse {
  results?: TockSearchHit[];
  restaurants?: TockSearchHit[];
}

/**
 * Pure parser. Exported for testing without nock.
 */
export function parseTockSearchResponse(raw: unknown): Venue[] {
  const r = (raw ?? {}) as TockSearchResponse;
  const hits = r.results ?? r.restaurants ?? [];
  const out: Venue[] = [];
  for (const h of hits) {
    const id = h.businessSlug ?? (h.id !== undefined ? String(h.id) : undefined);
    if (!id || !h.name) continue;
    const v: Venue = {
      id,
      name: h.name,
      ...(h.city?.name ? { city: h.city.name } : {}),
      ...(h.region?.name ? { region: h.region.name } : {}),
      ...(h.cuisines && h.cuisines.length > 0 ? { cuisine: h.cuisines[0]! } : {}),
      ...(h.url ? { url: h.url } : {}),
      raw: h,
    };
    out.push(v);
  }
  return out;
}

export async function searchVenues(q: VenueQuery, creds: Credentials): Promise<Venue[]> {
  const client = new TockClient(tockCredentials(creds));
  const raw = await client.searchRestaurants({
    query: q.query,
    ...(q.limit !== undefined ? { limit: q.limit } : {}),
  });
  return parseTockSearchResponse(raw);
}
