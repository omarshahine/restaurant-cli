import type { Credentials, Venue, VenueQuery } from "../types.js";
import { OpenTableClient } from "./client.js";
import { searchViaBrowser } from "./browser.js";

/** Shape of a /dapi/fe/gql?opname=Autocomplete response item. */
interface AutocompleteItem {
  id?: string;
  type?: string;
  name?: string;
  country?: string;
  metroId?: number | null;
  metroName?: string | null;
  macroName?: string | null;
  neighborhoodName?: string | null;
  latitude?: number;
  longitude?: number;
}

/**
 * Pure parser for OpenTable's Autocomplete GraphQL response. Filters to
 * `type: "Restaurant"` and normalizes to the shared `Venue` shape.
 */
export function parseAutocompleteResponse(raw: unknown, limit?: number): Venue[] {
  const r = raw as { data?: { autocomplete?: { autocompleteResults?: AutocompleteItem[] } } };
  const all = r?.data?.autocomplete?.autocompleteResults ?? [];
  const restaurants = all.filter((x) => x.type === "Restaurant");
  const take = limit ? restaurants.slice(0, limit) : restaurants;
  return take
    .map((hit): Venue | null => {
      if (!hit.id || !hit.name) return null;
      return {
        id: hit.id,
        name: hit.name,
        ...(hit.metroName ? { city: hit.metroName } : {}),
        ...(hit.neighborhoodName ? { region: hit.neighborhoodName } : {}),
        raw: hit,
      };
    })
    .filter((v): v is Venue => v !== null);
}

interface GraphQLSearchResponse {
  data?: {
    search?: {
      results?: Array<{
        restaurant?: {
          restaurantId?: number | string;
          name?: string;
          neighborhood?: { name?: string };
          metroName?: string;
          primaryCuisine?: { name?: string };
          urls?: { profileLink?: { link?: string } };
        };
      }>;
    };
  };
  errors?: Array<{ message?: string }>;
}

/**
 * Pure parser: `/dapi/fe/graphql` response → Venue[]. Kept independent of
 * the HTTP transport so a future browser-automation module can feed the
 * same JSON shape (captured via CDP) through this function.
 */
export function parseSearchResponse(raw: unknown): Venue[] {
  const g = raw as GraphQLSearchResponse;
  if (g?.errors?.length) {
    throw new Error(`OpenTable search: ${g.errors[0]?.message ?? "unknown error"}`);
  }

  const results = g?.data?.search?.results ?? [];
  return results
    .map((hit): Venue | null => {
      const r = hit.restaurant;
      if (!r?.restaurantId || !r.name) return null;
      return {
        id: String(r.restaurantId),
        name: r.name,
        ...(r.neighborhood?.name ? { region: r.neighborhood.name } : {}),
        ...(r.metroName ? { city: r.metroName } : {}),
        ...(r.primaryCuisine?.name ? { cuisine: r.primaryCuisine.name } : {}),
        ...(r.urls?.profileLink?.link
          ? {
              url: r.urls.profileLink.link.startsWith("http")
                ? r.urls.profileLink.link
                : `https://www.opentable.com${r.urls.profileLink.link}`,
            }
          : {}),
        raw: hit,
      };
    })
    .filter((v): v is Venue => v !== null);
}

/**
 * Live search — browser-driven. Drives opentable.com's homepage autocomplete
 * (patchright + persistent profile + channel:chrome + mouse jitter) which
 * defeats Akamai, then parses the Autocomplete GraphQL response.
 */
export async function searchVenues(q: VenueQuery, _creds: Credentials): Promise<Venue[]> {
  const raw = await searchViaBrowser(q.query, { limit: q.limit });
  return parseAutocompleteResponse(raw, q.limit);
}

/** Legacy HTTP-based search kept for parser tests; not used by Provider. */
export async function searchVenuesHttp(q: VenueQuery): Promise<Venue[]> {
  const client = new OpenTableClient();
  const raw = await client.searchRestaurants({
    term: q.query,
    covers: 2,
    first: q.limit ?? 20,
  });
  return parseSearchResponse(raw);
}
