import { describe, it, expect } from "vitest";
import { parseListResponse } from "../../../src/providers/tock/list.js";

describe("parseListResponse", () => {
  it("parses upcoming reservations with combined date/time", () => {
    const raw = {
      reservations: [
        {
          purchaseId: "p1",
          businessName: "Alinea",
          businessSlug: "alinea",
          start: "2026-06-13T19:30",
          size: 2,
          state: "confirmed",
        },
      ],
    };
    expect(parseListResponse(raw)).toEqual([
      {
        id: "p1",
        venueName: "Alinea",
        venueId: "alinea",
        date: "2026-06-13",
        time: "19:30",
        partySize: 2,
        status: "confirmed",
        raw: raw.reservations[0],
      },
    ]);
  });
  it("falls back to separate date/time fields", () => {
    const raw = {
      upcoming: [
        {
          id: "p2",
          businessName: "Atomix",
          businessSlug: "atomix",
          date: "2026-07-01",
          time: "18:45",
          partySize: 4,
        },
      ],
    };
    const out = parseListResponse(raw);
    expect(out[0]?.date).toBe("2026-07-01");
    expect(out[0]?.time).toBe("18:45");
    expect(out[0]?.partySize).toBe(4);
  });
  it("skips entries missing id", () => {
    expect(parseListResponse({ reservations: [{ businessName: "x" }] })).toEqual([]);
  });
});
