import { describe, it, expect } from "vitest";
import nock from "nock";
import { resyProvider } from "../../../src/providers/resy/provider.js";

describe("providers/resy/search", () => {
  it("normalizes venue hits from the Resy search payload", async () => {
    nock("https://api.resy.com")
      .post("/3/venuesearch/search")
      .reply(200, {
        search: {
          hits: [
            {
              objectID: "12345",
              name: "Le Bernardin",
              city: "ny",
              region: "Manhattan",
              url_slug: "le-bernardin",
            },
            {
              id: { resy: 999 },
              name: "Missing City",
            },
          ],
        },
      });

    const venues = await resyProvider.searchVenues(
      { query: "le bernardin", limit: 5 },
      { apiKey: "key", authToken: "tok" },
    );
    expect(venues).toHaveLength(2);
    expect(venues[0]!.id).toBe("12345");
    expect(venues[0]!.name).toBe("Le Bernardin");
    expect(venues[0]!.city).toBe("ny");
    expect(venues[1]!.id).toBe("999");
  });

  it("returns an empty array when the response has no hits", async () => {
    nock("https://api.resy.com").post("/3/venuesearch/search").reply(200, {});

    const venues = await resyProvider.searchVenues(
      { query: "nowhere" },
      { apiKey: "key", authToken: "tok" },
    );
    expect(venues).toEqual([]);
  });

  it("omits `location` from the request body (Resy rejects it with HTTP 400)", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    nock("https://api.resy.com")
      .post("/3/venuesearch/search", (body) => {
        capturedBody = body as Record<string, unknown>;
        return true;
      })
      .reply(200, { search: { hits: [] } });

    await resyProvider.searchVenues(
      { query: "omakase", city: "ny", limit: 5 },
      { apiKey: "key", authToken: "tok" },
    );

    expect(capturedBody).toBeDefined();
    expect(capturedBody).not.toHaveProperty("location");
    // City filter triggers upstream over-fetch (per_page bumped to 50) so the
    // caller's `limit` can still be honored after client-side filtering.
    expect(capturedBody).toMatchObject({ query: "omakase", per_page: 50, types: ["venue"] });
  });

  it("filters hits by city client-side when `city` is provided", async () => {
    nock("https://api.resy.com")
      .post("/3/venuesearch/search")
      .reply(200, {
        search: {
          hits: [
            { objectID: "1", name: "NY Spot", location: { code: "ny", name: "New York" } },
            { objectID: "2", name: "LA Spot", location: { code: "la", name: "Los Angeles" } },
            { objectID: "3", name: "Other NY Spot", city: "ny" },
          ],
        },
      });

    const venues = await resyProvider.searchVenues(
      { query: "spot", city: "ny" },
      { apiKey: "key", authToken: "tok" },
    );

    expect(venues.map((v) => v.id)).toEqual(["1", "3"]);
  });

  it("over-fetches upstream when a city filter is active so the caller's limit is honored after filtering", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    nock("https://api.resy.com")
      .post("/3/venuesearch/search", (body) => {
        capturedBody = body as Record<string, unknown>;
        return true;
      })
      .reply(200, {
        search: {
          hits: [
            { objectID: "ny-1", name: "NY 1", location: { code: "ny" } },
            { objectID: "la-1", name: "LA 1", location: { code: "la" } },
            { objectID: "ny-2", name: "NY 2", location: { code: "ny" } },
            { objectID: "la-2", name: "LA 2", location: { code: "la" } },
            { objectID: "ny-3", name: "NY 3", location: { code: "ny" } },
          ],
        },
      });

    const venues = await resyProvider.searchVenues(
      { query: "spot", city: "ny", limit: 2 },
      { apiKey: "key", authToken: "tok" },
    );

    // Upstream is over-fetched (>= 50) so client-side filter has headroom.
    expect(capturedBody?.per_page).toBe(50);
    // Caller's `limit` is honored AFTER filtering, not capped before it.
    expect(venues.map((v) => v.id)).toEqual(["ny-1", "ny-2"]);
  });
});
