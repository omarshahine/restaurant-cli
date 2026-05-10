import { describe, it, expect } from "vitest";
import { parseTockSearchResponse } from "../../../src/providers/tock/search.js";

describe("parseTockSearchResponse", () => {
  it("parses { results: [...] } shape", () => {
    const raw = {
      results: [
        {
          businessSlug: "alinea",
          name: "Alinea",
          city: { name: "Chicago" },
          region: { name: "IL" },
          cuisines: ["Modern American"],
        },
      ],
    };
    expect(parseTockSearchResponse(raw)).toEqual([
      {
        id: "alinea",
        name: "Alinea",
        city: "Chicago",
        region: "IL",
        cuisine: "Modern American",
        raw: raw.results[0],
      },
    ]);
  });

  it("falls back to { restaurants: [...] } shape", () => {
    const raw = { restaurants: [{ businessSlug: "atomix", name: "Atomix" }] };
    expect(parseTockSearchResponse(raw)).toEqual([
      { id: "atomix", name: "Atomix", raw: raw.restaurants[0] },
    ]);
  });

  it("skips entries missing id or name", () => {
    const raw = {
      results: [
        { businessSlug: "atomix" }, // no name
        { name: "No-id" }, // no id
        { businessSlug: "smyth", name: "Smyth" }, // ok
      ],
    };
    expect(parseTockSearchResponse(raw)).toHaveLength(1);
  });

  it("returns [] for empty/unknown shapes", () => {
    expect(parseTockSearchResponse(null)).toEqual([]);
    expect(parseTockSearchResponse({})).toEqual([]);
    expect(parseTockSearchResponse({ results: [] })).toEqual([]);
  });
});
