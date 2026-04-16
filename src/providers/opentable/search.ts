import type { Credentials, Venue, VenueQuery } from "../types.js";
import { OpenTableClient } from "./client.js";

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
 * Live search. Not wired into the Provider surface because the HTTP
 * transport is blocked by Akamai. Kept here so a future browser-backed
 * fetcher can call it by swapping the `fetchImpl` in OpenTableClient.
 */
export async function searchVenues(q: VenueQuery, _creds: Credentials): Promise<Venue[]> {
  const client = new OpenTableClient();
  const raw = await client.searchRestaurants({
    term: q.query,
    covers: 2,
    first: q.limit ?? 20,
  });
  return parseSearchResponse(raw);
}
