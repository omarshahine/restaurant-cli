import type { Venue, VenueQuery } from "../types.js";
import { ResyClient } from "./client.js";
import { resyCredentials } from "./auth.js";
import type { Credentials } from "../types.js";

interface ResySearchHit {
  id?: { resy?: string | number };
  objectID?: string;
  name?: string;
  city?: string;
  region?: string;
  url_slug?: string;
  _highlightResult?: unknown;
}

interface ResySearchResponse {
  search?: {
    hits?: ResySearchHit[];
  };
  hits?: ResySearchHit[];
}

/**
 * Search venues by free-text query.
 *
 * see resy-cli: internal/resy/search.go — same request shape (POST
 * /3/venuesearch/search with `query`, `per_page`, optional `location`).
 */
export async function searchVenues(q: VenueQuery, creds: Credentials): Promise<Venue[]> {
  const client = new ResyClient(resyCredentials(creds));
  const raw = (await client.searchVenues({
    query: q.query,
    ...(q.city ? { city: q.city } : {}),
    limit: q.limit ?? 20,
  })) as ResySearchResponse;

  const hits = raw?.search?.hits ?? raw?.hits ?? [];
  return hits
    .map((h): Venue | null => {
      const id = h.objectID ?? (h.id?.resy !== undefined ? String(h.id.resy) : undefined);
      if (!id || !h.name) return null;
      return {
        id,
        name: h.name,
        ...(h.city ? { city: h.city } : {}),
        ...(h.region ? { region: h.region } : {}),
        ...(h.url_slug ? { url: `https://resy.com/cities/${h.city ?? ""}/${h.url_slug}` } : {}),
        raw: h,
      };
    })
    .filter((v): v is Venue => v !== null);
}
