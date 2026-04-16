import { describe, it, expect } from "vitest";
import { buildBookingUrl, buildProfileUrl } from "../../../src/providers/opentable/deeplink.js";
import { openTableProvider } from "../../../src/providers/opentable/provider.js";

describe("providers/opentable/deeplink", () => {
  it("builds a booking URL with rid, datetime, covers", () => {
    const url = buildBookingUrl({
      restaurantId: 12345,
      date: "2026-05-01",
      time: "19:30",
      partySize: 2,
    });
    expect(url).toBe(
      "https://www.opentable.com/booking/experiences-availability?rid=12345&datetime=2026-05-01T19%3A30&covers=2",
    );
  });

  it("builds a slug-based profile URL when all pieces are present", () => {
    expect(
      buildProfileUrl({
        citySlug: "new-york",
        restaurantSlug: "carbone",
        restaurantId: 12345,
      }),
    ).toBe("https://www.opentable.com/r/carbone-new-york");
  });

  it("falls back to an id-based profile URL otherwise", () => {
    expect(buildProfileUrl({ restaurantId: 12345 })).toBe("https://www.opentable.com/r/12345");
  });

  it("Provider.getBookingUrl is wired", async () => {
    const url = await openTableProvider.getBookingUrl!(
      {
        venueId: "999",
        partySize: 4,
        date: "2026-06-10",
        time: "20:00",
      },
      {},
    );
    expect(url).toContain("rid=999");
    expect(url).toContain("covers=4");
  });
});
