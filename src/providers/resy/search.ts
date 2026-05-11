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
  location?: {
    name?: string;
    code?: string;
    url_slug?: string;
  };
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
 * Resy's `/3/venuesearch/search` no longer accepts a `location` field on the
 * request body (rejects with HTTP 400 "Unknown field"), so we filter by city
 * client-side against the per-hit `location.code` returned by the gateway.
 */
export async function searchVenues(q: VenueQuery, creds: Credentials): Promise<Venue[]> {
  const client = new ResyClient(resyCredentials(creds));
  const raw = (await client.searchVenues({
    query: q.query,
    limit: q.limit ?? 20,
  })) as ResySearchResponse;

  const cityFilter = q.city?.toLowerCase();
  const hits = (raw?.search?.hits ?? raw?.hits ?? []).filter((h) =>
    cityFilter ? (h.location?.code ?? h.city)?.toLowerCase() === cityFilter : true,
  );
  return hits
    .map((h): Venue | null => {
      const id = h.objectID ?? (h.id?.resy !== undefined ? String(h.id.resy) : undefined);
      if (!id || !h.name) return null;
      const cityCode = h.location?.code ?? h.city;
      const cityName = h.location?.name ?? h.city;
      const venueSlug = h.url_slug;
      return {
        id,
        name: h.name,
        ...(cityName ? { city: cityName } : {}),
        ...(h.region ? { region: h.region } : {}),
        ...(cityCode && venueSlug
          ? { url: `https://resy.com/cities/${cityCode}/${venueSlug}` }
          : {}),
        raw: h,
      };
    })
    .filter((v): v is Venue => v !== null);
}
