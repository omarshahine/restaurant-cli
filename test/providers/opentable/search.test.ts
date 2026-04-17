import { describe, it, expect } from "vitest";
import {
  parseSearchResponse,
  parseAutocompleteResponse,
} from "../../../src/providers/opentable/search.js";

describe("providers/opentable/search (legacy HTTP shape)", () => {
  it("normalizes the GraphQL search response into Venues", () => {
    const venues = parseSearchResponse({
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
    expect(venues).toHaveLength(2);
    expect(venues[0]!.id).toBe("12345");
    expect(venues[0]!.name).toBe("Carbone");
    expect(venues[0]!.city).toBe("New York");
    expect(venues[0]!.region).toBe("Greenwich Village");
    expect(venues[0]!.cuisine).toBe("Italian");
    expect(venues[0]!.url).toBe("https://www.opentable.com/r/carbone-new-york");
    expect(venues[1]!.id).toBe("67890");
  });

  it("throws when GraphQL returns errors", () => {
    expect(() => parseSearchResponse({ errors: [{ message: "bad query" }] })).toThrow(
      /bad query/,
    );
  });

  it("returns an empty array when there are no results", () => {
    expect(parseSearchResponse({ data: { search: { results: [] } } })).toEqual([]);
  });

});

describe("providers/opentable/search (browser autocomplete parser)", () => {
  it("filters autocomplete items to type=Restaurant and normalizes fields", () => {
    const raw = {
      data: {
        autocomplete: {
          autocompleteResults: [
            {
              id: "12345",
              type: "Restaurant",
              name: "Le Bernardin",
              metroName: "New York",
              neighborhoodName: "Midtown",
              country: "United States",
            },
            {
              id: "99",
              type: "SuggestedSearch",
              name: "French",
            },
            {
              id: "67890",
              type: "Restaurant",
              name: "Bernardin's Charlotte",
              metroName: "Charlotte",
              neighborhoodName: "Uptown",
            },
          ],
        },
      },
    };
    const venues = parseAutocompleteResponse(raw);
    expect(venues).toHaveLength(2);
    expect(venues[0]!.id).toBe("12345");
    expect(venues[0]!.name).toBe("Le Bernardin");
    expect(venues[0]!.city).toBe("New York");
    expect(venues[0]!.region).toBe("Midtown");
  });

  it("applies the limit", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      type: "Restaurant",
      name: `Restaurant ${i}`,
    }));
    const venues = parseAutocompleteResponse(
      { data: { autocomplete: { autocompleteResults: many } } },
      5,
    );
    expect(venues).toHaveLength(5);
  });

  it("returns empty for missing data", () => {
    expect(parseAutocompleteResponse({})).toEqual([]);
    expect(parseAutocompleteResponse(null)).toEqual([]);
  });
});
