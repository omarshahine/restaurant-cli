import { describe, it, expect, afterEach } from "vitest";
import nock from "nock";
import { resyProvider } from "../../../src/providers/resy/provider.js";

afterEach(() => {
  nock.cleanAll();
});

describe("providers/resy/book — two-step flow", () => {
  it("runs /3/details then /3/book and returns the resy_token", async () => {
    nock("https://api.resy.com")
      .post("/3/details", (body) => body?.config_id === "rgs://resy/1387/abc")
      .reply(200, {
        book_token: { value: "bt-abc-123" },
        user: { payment_methods: [{ id: 456, is_default: true }] },
      })
      .post("/3/book", /book_token=bt-abc-123/)
      .reply(200, { resy_token: "res-tok-xyz", reservation_id: 99 });

    const result = await resyProvider.book(
      {
        venueId: "1387",
        partySize: 2,
        date: "2026-05-15",
        time: "19:00",
        slotToken: "rgs://resy/1387/abc",
      },
      { apiKey: "key", authToken: "tok" },
    );
    expect(result.ok).toBe(true);
    expect(result.reservationId).toBe("res-tok-xyz");
    expect(result.confirmationMessage).toContain("res-tok-xyz");
  });

  it("looks up availability when no slotToken is passed and picks the matching time", async () => {
    nock("https://api.resy.com")
      .get(/\/4\/find/)
      .reply(200, {
        results: {
          venues: [
            {
              slots: [
                {
                  date: { start: "2026-05-15 19:00:00" },
                  config: { id: 1, token: "rgs://resy/1387/abc" },
                },
                {
                  date: { start: "2026-05-15 19:30:00" },
                  config: { id: 2, token: "rgs://resy/1387/def" },
                },
              ],
            },
          ],
        },
      })
      .post("/3/details")
      .reply(200, {
        book_token: { value: "bt-xyz" },
        user: { payment_methods: [{ id: 456, is_default: true }] },
      })
      .post("/3/book", /book_token=bt-xyz/)
      .reply(200, { resy_token: "res-tok-1930" });

    const result = await resyProvider.book(
      { venueId: "1387", partySize: 2, date: "2026-05-15", time: "19:30" },
      { apiKey: "key", authToken: "tok" },
    );
    expect(result.ok).toBe(true);
    expect(result.reservationId).toBe("res-tok-1930");
  });

  it("returns ok:false with a clear error when no slot matches the requested time", async () => {
    nock("https://api.resy.com")
      .get(/\/4\/find/)
      .reply(200, {
        results: {
          venues: [
            {
              slots: [
                {
                  date: { start: "2026-05-15 19:00:00" },
                  config: { id: 1, token: "rgs://resy/1387/abc" },
                },
              ],
            },
          ],
        },
      });

    const result = await resyProvider.book(
      { venueId: "1387", partySize: 2, date: "2026-05-15", time: "20:00" },
      { apiKey: "key", authToken: "tok" },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No open slot at 20:00/);
  });

  it("throws when /3/details returns no book_token (slot expired)", async () => {
    nock("https://api.resy.com")
      .post("/3/details")
      .reply(200, { user: { payment_methods: [{ id: 456 }] } });

    await expect(
      resyProvider.book(
        {
          venueId: "1387",
          partySize: 2,
          date: "2026-05-15",
          time: "19:00",
          slotToken: "rgs://expired",
        },
        { apiKey: "key", authToken: "tok" },
      ),
    ).rejects.toThrow(/no book_token/);
  });

  it("throws when the account has no payment methods on file", async () => {
    nock("https://api.resy.com")
      .post("/3/details")
      .reply(200, { book_token: { value: "bt" }, user: { payment_methods: [] } });

    await expect(
      resyProvider.book(
        {
          venueId: "1387",
          partySize: 2,
          date: "2026-05-15",
          time: "19:00",
          slotToken: "rgs://resy/1387/abc",
        },
        { apiKey: "key", authToken: "tok" },
      ),
    ).rejects.toThrow(/No payment method/);
  });

  it("returns ok:false when /3/book returns an error body", async () => {
    nock("https://api.resy.com")
      .post("/3/details")
      .reply(200, {
        book_token: { value: "bt-abc" },
        user: { payment_methods: [{ id: 456, is_default: true }] },
      })
      .post("/3/book")
      .reply(200, { error: { code: "RESY_FULLY_BOOKED", message: "Slot just filled" } });

    const result = await resyProvider.book(
      {
        venueId: "1387",
        partySize: 2,
        date: "2026-05-15",
        time: "19:00",
        slotToken: "rgs://resy/1387/abc",
      },
      { apiKey: "key", authToken: "tok" },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Slot just filled");
  });
});
