import { describe, it, expect } from "vitest";
import { parseAvailabilityResponse } from "../../../src/providers/opentable/availability.js";
import { openTableProvider } from "../../../src/providers/opentable/provider.js";

describe("providers/opentable/availability", () => {
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
    expect(slots[0]!.token).toContain("opentable.com/booking/experiences-availability");
    expect(slots[0]!.token).toContain("rid=12345");
    expect(slots[0]!.token).toContain("datetime=2026-05-01T19%3A00");
    expect(slots[0]!.token).toContain("covers=2");
  });

  it("Provider.getAvailability throws CapabilityError (browser flow not yet wired)", async () => {
    await expect(
      openTableProvider.getAvailability(
        { venueId: "1", date: "2026-05-01", partySize: 2 },
        {},
      ),
    ).rejects.toThrow(/not yet wired/);
  });
});
