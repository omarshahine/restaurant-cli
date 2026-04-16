import { describe, it, expect } from "vitest";
import nock from "nock";
import { openTableProvider } from "../../../src/providers/opentable/provider.js";

describe("providers/opentable/search", () => {
  it("normalizes the GraphQL search response into Venues", async () => {
    nock("https://www.opentable.com")
      .post("/dapi/fe/graphql")
      .reply(200, {
        data: {
          search: {
            results: [
              {
                restaurant: {
                  restaurantId: 12345,
                  name: "Carbone",
                  neighborhood: { name: "Greenwich Village" },
                  metroName: "New York",
                  primaryCuisine: { name: "Italian" },
                  urls: { profileLink: { link: "/r/carbone-new-york" } },
                },
              },
              {
                restaurant: {
                  restaurantId: "67890",
                  name: "Minimal Rec",
                },
              },
            ],
          },
        },
      });

    const venues = await openTableProvider.searchVenues(
      { query: "carbone", limit: 5 },
      {},
    );
    expect(venues).toHaveLength(2);
    expect(venues[0]!.id).toBe("12345");
    expect(venues[0]!.name).toBe("Carbone");
    expect(venues[0]!.city).toBe("New York");
    expect(venues[0]!.region).toBe("Greenwich Village");
    expect(venues[0]!.cuisine).toBe("Italian");
    expect(venues[0]!.url).toBe("https://www.opentable.com/r/carbone-new-york");
    expect(venues[1]!.id).toBe("67890");
  });

  it("throws when GraphQL returns errors", async () => {
    nock("https://www.opentable.com")
      .post("/dapi/fe/graphql")
      .reply(200, { errors: [{ message: "bad query" }] });

    await expect(openTableProvider.searchVenues({ query: "x" }, {})).rejects.toThrow(/bad query/);
  });

  it("returns an empty array when there are no results", async () => {
    nock("https://www.opentable.com")
      .post("/dapi/fe/graphql")
      .reply(200, { data: { search: { results: [] } } });

    const venues = await openTableProvider.searchVenues({ query: "nowhere" }, {});
    expect(venues).toEqual([]);
  });
});
