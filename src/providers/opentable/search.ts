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
 * Search OpenTable restaurants by free-text query. No credentials required
 * (the /dapi/ endpoint works anonymously with browser-ish headers).
 */
export async function searchVenues(q: VenueQuery, _creds: Credentials): Promise<Venue[]> {
  const client = new OpenTableClient();
  const raw = (await client.searchRestaurants({
    term: q.query,
    covers: 2,
    first: q.limit ?? 20,
  })) as GraphQLSearchResponse;

  if (raw?.errors?.length) {
    // GraphQL-level error. Surface the first message; keep the rest in raw.
    throw new Error(`OpenTable search: ${raw.errors[0]?.message ?? "unknown error"}`);
  }

  const results = raw?.data?.search?.results ?? [];
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
