import { describe, it, expect, afterEach } from "vitest";
import nock from "nock";
import {
  extractVenueNameFromShare,
  filterUpcoming,
  parseReservationsResponse,
} from "../../../src/providers/resy/list.js";
import { resyProvider } from "../../../src/providers/resy/provider.js";

afterEach(() => {
  nock.cleanAll();
});

describe("providers/resy/list — pure parser", () => {
  it("normalizes the MODERN /3/user/reservations shape (time_slot is a bare string, venue name lives in share)", () => {
    // This is the shape Resy actually returns as of 2026 (confirmed against a
    // real authenticated account). `venue` carries only {id, currency}, `time_slot`
    // is "HH:MM:SS", and the human-readable venue name has to be extracted
    // from share.generic_message.
    const raw = {
      reservations: [
        {
          resy_token: "res-abc",
          day: "2026-01-18",
          num_seats: 2,
          venue: { id: 647, currency: "USD" },
          time_slot: "17:30:00",
          when: "2026-01-19 01:30:00",
          status: { finished: 1, no_show: 0 },
          share: {
            generic_message: "Please RSVP for Nishino on January 18 at 5:30PM",
          },
        },
      ],
    };
    const rs = parseReservationsResponse(raw);
    expect(rs).toHaveLength(1);
    expect(rs[0]!.id).toBe("res-abc");
    expect(rs[0]!.venueName).toBe("Nishino");
    expect(rs[0]!.venueId).toBe("647");
    expect(rs[0]!.date).toBe("2026-01-18");
    expect(rs[0]!.time).toBe("17:30");
    expect(rs[0]!.partySize).toBe(2);
    expect(rs[0]!.status).toBe("Completed");
  });

  it("tolerates the LEGACY shape (time_slot.date object, venue.name inline)", () => {
    const raw = {
      reservations: [
        {
          resy_token: "res-def",
          day: "2024-12-31",
          num_seats: 4,
          venue: { id: 6194, name: "Carbone" },
          time_slot: { date: "2024-12-31 20:30:00" },
          status: "Attended",
        },
      ],
    };
    const rs = parseReservationsResponse(raw);
    expect(rs[0]!.venueName).toBe("Carbone");
    expect(rs[0]!.date).toBe("2024-12-31");
    expect(rs[0]!.time).toBe("20:30");
    expect(rs[0]!.status).toBe("Attended");
  });

  it("extractVenueNameFromShare handles both RSVP and Reservation phrasings", () => {
    expect(
      extractVenueNameFromShare({
        generic_message: "Please RSVP for Le Bernardin on May 15 at 7:00PM",
      }),
    ).toBe("Le Bernardin");
    expect(
      extractVenueNameFromShare({
        message: [{ title: "RSVP for our Reservation at Carbone" }],
      }),
    ).toBe("Carbone");
    expect(extractVenueNameFromShare({ generic_message: "no match here" })).toBe("");
    expect(extractVenueNameFromShare(undefined)).toBe("");
  });

  it("skips rows missing resy_token", () => {
    const raw = {
      reservations: [
        { day: "2026-05-15", num_seats: 2 },
        { resy_token: "ok", day: "2026-06-01", num_seats: 2 },
      ],
    };
    expect(parseReservationsResponse(raw)).toHaveLength(1);
  });

  it("returns [] for empty or missing payloads", () => {
    expect(parseReservationsResponse({})).toEqual([]);
    expect(parseReservationsResponse(null)).toEqual([]);
    expect(parseReservationsResponse({ reservations: [] })).toEqual([]);
  });

  it("filterUpcoming strips dates before today", () => {
    const rs = [
      { id: "a", venueName: "X", venueId: "1", date: "2024-01-01", time: "19:00", partySize: 2 },
      { id: "b", venueName: "Y", venueId: "2", date: "2026-05-15", time: "20:00", partySize: 2 },
    ];
    const upcoming = filterUpcoming(rs, "2026-04-17");
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]!.id).toBe("b");
  });
});

describe("providers/resy/list — provider.listReservations", () => {
  it("round-trips /3/user/reservations into Reservation[] (modern shape)", async () => {
    nock("https://api.resy.com")
      .get("/3/user/reservations")
      .reply(200, {
        reservations: [
          {
            resy_token: "res-abc",
            day: "2026-05-15",
            num_seats: 2,
            venue: { id: 1387, currency: "USD" },
            time_slot: "19:00:00",
            share: {
              generic_message: "Please RSVP for Le Bernardin on May 15 at 7:00PM",
            },
          },
        ],
      });

    const rs = await resyProvider.listReservations({ apiKey: "key", authToken: "tok" });
    expect(rs).toHaveLength(1);
    expect(rs[0]!.venueName).toBe("Le Bernardin");
    expect(rs[0]!.time).toBe("19:00");
  });
});
