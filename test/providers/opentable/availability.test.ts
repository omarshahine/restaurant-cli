import { describe, it, expect } from "vitest";
import {
  findSlotsInNextData,
  parseAvailabilityResponse,
  parseNextDataAvailabilityResponse,
} from "../../../src/providers/opentable/availability.js";
import { openTableProvider } from "../../../src/providers/opentable/provider.js";

describe("providers/opentable/availability — legacy /dapi/ parser", () => {
  it("maps /dapi/ availability times into Slot objects with a booking-url token", () => {
    const slots = parseAvailabilityResponse(
      {
        availability: {
          times: [
            {
              time: "19:00",
              slotHash: "abc",
              available: true,
              attributes: { category: "Dining Room" },
            },
            { time: "19:30", slotHash: "def", available: true },
            { time: "20:00", slotHash: "ghi", available: false },
          ],
        },
      },
      { venueId: "12345", date: "2026-05-01", partySize: 2 },
    );
    expect(slots).toHaveLength(2);
    expect(slots[0]!.time).toBe("19:00");
    expect(slots[0]!.configId).toBe("abc");
    expect(slots[0]!.type).toBe("Dining Room");
    expect(slots[0]!.token).toContain("opentable.com/restref/client");
    expect(slots[0]!.token).toContain("rid=12345");
    expect(slots[0]!.token).toContain("datetime=2026-05-01T19%3A00");
    expect(slots[0]!.token).toContain("partysize=2");
  });
});

describe("providers/opentable/availability — __NEXT_DATA__ parser", () => {
  it("finds slots via the primary availabilityData.availability.times path", () => {
    const nd = {
      props: {
        pageProps: {
          initialData: {
            availabilityData: {
              availability: {
                times: [
                  {
                    time: "19:00",
                    slotHash: "slot-a",
                    attributes: { category: "Dining Room" },
                  },
                  {
                    time: "19:30",
                    slotHash: "slot-b",
                    attributes: { diningArea: "Patio" },
                  },
                  { time: "20:00", slotHash: "slot-c", isSoldOut: true },
                ],
              },
            },
          },
        },
      },
    };
    const found = findSlotsInNextData(nd);
    expect(found).toHaveLength(3);

    const slots = parseNextDataAvailabilityResponse(nd, {
      venueId: "12345",
      date: "2026-05-01",
      partySize: 2,
    });
    // Only 2 — the isSoldOut: true slot is dropped.
    expect(slots).toHaveLength(2);
    expect(slots[0]!.time).toBe("19:00");
    expect(slots[0]!.type).toBe("Dining Room");
    expect(slots[1]!.type).toBe("Patio");
    expect(slots[0]!.token).toContain("rid=12345");
  });

  it("finds slots via the fallback restaurantAvailability path", () => {
    const nd = {
      props: {
        pageProps: {
          initialData: {
            restaurantAvailability: {
              times: [{ time: "18:00", slotAvailabilityToken: "tok-xyz" }],
            },
          },
        },
      },
    };
    const slots = parseNextDataAvailabilityResponse(nd, {
      venueId: "99",
      date: "2026-05-01",
      partySize: 4,
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]!.configId).toBe("tok-xyz");
    expect(slots[0]!.token).toContain("partysize=4");
  });

  it("uses BFS last-resort discovery when OpenTable moves the array", () => {
    // OpenTable reshuffles their SSR payload occasionally; the BFS fallback
    // walks the tree looking for an array whose first element smells like
    // a slot. This keeps the scraper alive across minor schema drift.
    const nd = {
      props: {
        pageProps: {
          whatever: { deep: { nest: [{ time: "17:00", slotHash: "a" }] } },
        },
      },
    };
    expect(findSlotsInNextData(nd)).toHaveLength(1);
    const slots = parseNextDataAvailabilityResponse(nd, {
      venueId: "1",
      date: "2026-05-01",
      partySize: 2,
    });
    expect(slots[0]!.time).toBe("17:00");
  });

  it("returns [] gracefully when nothing matches", () => {
    expect(
      parseNextDataAvailabilityResponse(
        { props: {} },
        { venueId: "1", date: "2026-05-01", partySize: 2 },
      ),
    ).toEqual([]);
    expect(
      parseNextDataAvailabilityResponse(null, {
        venueId: "1",
        date: "2026-05-01",
        partySize: 2,
      }),
    ).toEqual([]);
  });

  it("honors `available: false` as an explicit drop signal", () => {
    const nd = {
      props: {
        pageProps: {
          availability: {
            times: [
              { time: "19:00", available: true },
              { time: "19:30", available: false },
              { time: "20:00" }, // available is undefined — treated as available
            ],
          },
        },
      },
    };
    const slots = parseNextDataAvailabilityResponse(nd, {
      venueId: "1",
      date: "2026-05-01",
      partySize: 2,
    });
    expect(slots.map((s) => s.time)).toEqual(["19:00", "20:00"]);
  });
});

describe("providers/opentable/availability — Provider gating", () => {
  it("capabilities.availability is true with API+browser fallback wired", () => {
    // Mode is picked at call time via RESTAURANT_CLI_OT_MODE
    // (api | browser | auto). Default `auto` tries the GQL persisted-query
    // path first, falls back to the patchright scrape on Akamai 403.
    expect(openTableProvider.capabilities.availability).toBe(true);
  });

  it("search + availability are OFF by default (site-automation opt-in required)", async () => {
    const prev = process.env["RESTAURANT_CLI_ENABLE_SITE_AUTOMATION"];
    delete process.env["RESTAURANT_CLI_ENABLE_SITE_AUTOMATION"];
    try {
      // Both gated paths fail closed before any network call.
      await expect(
        openTableProvider.searchVenues({ query: "x" }, {}),
      ).rejects.toThrow(/off by default/i);
      await expect(
        openTableProvider.getAvailability(
          { venueId: "1", date: "2026-05-01", partySize: 2 },
          {},
        ),
      ).rejects.toThrow(/off by default/i);
    } finally {
      if (prev === undefined)
        delete process.env["RESTAURANT_CLI_ENABLE_SITE_AUTOMATION"];
      else process.env["RESTAURANT_CLI_ENABLE_SITE_AUTOMATION"] = prev;
    }
  });
});
