import { describe, it, expect } from "vitest";
import { trgRestaurantToVenue } from "../../../src/providers/tock/search.js";
import type { TrgRestaurant } from "../../../src/providers/tock/trg.js";

describe("tock/search.trgRestaurantToVenue", () => {
  it("projects trg restaurants into Venue shape", () => {
    const r: TrgRestaurant = {
      id: "4891",
      slug: "canlis",
      name: "Canlis",
      network: "tock",
      metro: "Seattle",
      cuisine: "Fine Dining",
      url: "https://www.exploretock.com/canlis",
      latitude: 47.6437,
      longitude: -122.3478,
      match_score: 0.95,
    };
    expect(trgRestaurantToVenue(r)).toEqual({
      id: "canlis",
      name: "Canlis",
      city: "Seattle",
      cuisine: "Fine Dining",
      url: "https://www.exploretock.com/canlis",
      raw: r,
    });
  });

  it("omits empty/optional fields", () => {
    const r: TrgRestaurant = { id: "1", slug: "x", name: "X", network: "tock" };
    const v = trgRestaurantToVenue(r);
    expect(v).toEqual({ id: "x", name: "X", raw: r });
  });
});
