import { describe, it, expect } from "vitest";
import nock from "nock";
import {
  parseAvailabilityResponse,
  parseResyTime,
} from "../../../src/providers/resy/availability.js";
import { resyProvider } from "../../../src/providers/resy/provider.js";

describe("providers/resy/availability — pure parser", () => {
  it("normalizes /4/find slots into Slot[]", () => {
    const raw = {
      results: {
        venues: [
          {
            venue: { id: { resy: 1387 }, name: "Le Bernardin" },
            slots: [
              {
                date: { start: "2026-05-15 19:00:00", end: "2026-05-15 21:00:00" },
                config: { id: 8888, token: "rgs://resy/1387/abc", type: "Dining Room" },
              },
              {
                date: { start: "2026-05-15 19:30:00" },
                config: { id: 9999, token: "rgs://resy/1387/def", type: "Bar" },
              },
            ],
          },
        ],
      },
    };
    const slots = parseAvailabilityResponse(raw);
    expect(slots).toHaveLength(2);
    expect(slots[0]!.token).toBe("rgs://resy/1387/abc");
    expect(slots[0]!.time).toBe("19:00");
    expect(slots[0]!.type).toBe("Dining Room");
    expect(slots[0]!.configId).toBe("8888");
    expect(slots[1]!.time).toBe("19:30");
    expect(slots[1]!.type).toBe("Bar");
  });

  it("skips slots missing a token or start time", () => {
    const raw = {
      results: {
        venues: [
          {
            slots: [
              { date: { start: "2026-05-15 19:00:00" } /* no config.token */ },
              { config: { token: "rgs://x" } /* no date.start */ },
              { date: { start: "2026-05-15 20:00:00" }, config: { token: "rgs://y" } },
            ],
          },
        ],
      },
    };
    expect(parseAvailabilityResponse(raw)).toHaveLength(1);
  });

  it("returns [] when there are no venues", () => {
    expect(parseAvailabilityResponse({ results: { venues: [] } })).toEqual([]);
    expect(parseAvailabilityResponse({})).toEqual([]);
    expect(parseAvailabilityResponse(null)).toEqual([]);
  });

  it("parseResyTime extracts HH:mm from various inputs", () => {
    expect(parseResyTime("2026-05-15 19:00:00")).toBe("19:00");
    expect(parseResyTime("2026-05-15 09:05:30")).toBe("09:05");
    expect(parseResyTime("no time here")).toBe("no time here");
  });
});

describe("providers/resy/availability — provider.getAvailability", () => {
  it("hits /4/find and returns Slot[] end-to-end", async () => {
    nock("https://api.resy.com")
      .get(/\/4\/find/)
      .reply(200, {
        results: {
          venues: [
            {
              slots: [
                {
                  date: { start: "2026-05-15 19:00:00" },
                  config: { id: 8888, token: "rgs://resy/1387/abc", type: "Dining Room" },
                },
              ],
            },
          ],
        },
      });

    const slots = await resyProvider.getAvailability(
      { venueId: "1387", date: "2026-05-15", partySize: 2 },
      { apiKey: "key", authToken: "tok" },
    );
    expect(slots).toHaveLength(1);
    expect(slots[0]!.time).toBe("19:00");
    expect(slots[0]!.token).toBe("rgs://resy/1387/abc");
  });

  it("wraps /4/find failures in a ProviderError", async () => {
    nock("https://api.resy.com").get(/\/4\/find/).reply(500, "server go boom");
    await expect(
      resyProvider.getAvailability(
        { venueId: "1387", date: "2026-05-15", partySize: 2 },
        { apiKey: "key", authToken: "tok" },
      ),
    ).rejects.toThrow(/Resy availability lookup failed/);
  });
});
