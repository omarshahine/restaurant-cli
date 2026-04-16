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
});
