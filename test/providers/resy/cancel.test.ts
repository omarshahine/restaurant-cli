import { describe, it, expect, afterEach } from "vitest";
import nock from "nock";
import { resyProvider } from "../../../src/providers/resy/provider.js";

afterEach(() => {
  nock.cleanAll();
});

describe("providers/resy/cancel", () => {
  it("returns ok:true when Resy confirms the cancellation", async () => {
    nock("https://api.resy.com")
      .post("/3/cancel", /resy_token=res-abc/)
      .reply(200, { cancelled: true });

    const result = await resyProvider.cancel(
      "res-abc",
      { apiKey: "key", authToken: "tok" },
      { confirmed: true },
    );
    expect(result.ok).toBe(true);
  });

  it("accepts a cancel_token response as success", async () => {
    nock("https://api.resy.com")
      .post("/3/cancel")
      .reply(200, { cancel_token: "cnc-123" });

    const result = await resyProvider.cancel(
      "res-abc",
      { apiKey: "key", authToken: "tok" },
      { confirmed: true },
    );
    expect(result.ok).toBe(true);
  });

  it("returns ok:false with the error message when Resy reports a problem", async () => {
    nock("https://api.resy.com")
      .post("/3/cancel")
      .reply(200, { error: { message: "Reservation already cancelled" } });

    const result = await resyProvider.cancel(
      "res-abc",
      { apiKey: "key", authToken: "tok" },
      { confirmed: true },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already cancelled/);
  });

  it("wraps HTTP failures as ProviderError", async () => {
    nock("https://api.resy.com").post("/3/cancel").reply(404, "not found");
    await expect(
      resyProvider.cancel(
        "nope",
        { apiKey: "key", authToken: "tok" },
        { confirmed: true },
      ),
    ).rejects.toThrow(/Resy cancel failed/);
  });

  it("refuses to cancel when opts.confirmed is not explicitly true", async () => {
    // No nock mocks: the guard must fire before any network call.
    await expect(
      resyProvider.cancel("res-abc", { apiKey: "key", authToken: "tok" }),
    ).rejects.toThrow(/confirmed must be explicitly true/);
  });
});
