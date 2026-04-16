import { describe, it, expect } from "vitest";
import nock from "nock";
import { openTableProvider } from "../../../src/providers/opentable/provider.js";

describe("providers/opentable/availability", () => {
  it("maps /dapi/ availability times into Slot objects with a booking-url token", async () => {
    nock("https://www.opentable.com")
      .get("/dapi/booking/restaurant/12345/availability")
      .query(true)
      .reply(200, {
        availability: {
          times: [
            { time: "19:00", slotHash: "abc", available: true, attributes: { category: "Dining Room" } },
            { time: "19:30", slotHash: "def", available: true },
            { time: "20:00", slotHash: "ghi", available: false }, // filtered out
          ],
        },
      });

    const slots = await openTableProvider.getAvailability(
      { venueId: "12345", date: "2026-05-01", partySize: 2 },
      {},
    );
    expect(slots).toHaveLength(2);
    expect(slots[0]!.time).toBe("19:00");
    expect(slots[0]!.configId).toBe("abc");
    expect(slots[0]!.type).toBe("Dining Room");
    expect(slots[0]!.token).toContain("opentable.com/booking/experiences-availability");
    expect(slots[0]!.token).toContain("rid=12345");
    expect(slots[0]!.token).toContain("datetime=2026-05-01T19%3A00");
    expect(slots[0]!.token).toContain("covers=2");
  });
});
