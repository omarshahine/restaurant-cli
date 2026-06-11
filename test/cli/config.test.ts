import { describe, it, expect } from "vitest";
import { redact } from "../../src/cli/commands/config.js";

describe("config redact", () => {
  it("masks secret-looking string values", () => {
    expect(
      redact({
        email: "you@example.com",
        authToken: "tok_abc",
        apiKey: "pk_123",
        password: "hunter2",
        sessionCookies: "a=b; c=d",
      }),
    ).toEqual({
      email: "you@example.com",
      authToken: "***redacted***",
      apiKey: "***redacted***",
      password: "***redacted***",
      sessionCookies: "***redacted***",
    });
  });

  it("masks secret-named keys regardless of value type (string, array, object)", () => {
    expect(
      redact({
        sessionCookies: [{ name: "sid", value: "abc" }],
        auth: { token: "nested" },
        apiKey: "k",
      }),
    ).toEqual({
      sessionCookies: "***redacted***",
      auth: "***redacted***",
      apiKey: "***redacted***",
    });
  });

  it("preserves tokenRef pointers (they hold no value)", () => {
    const ref = { source: "file", provider: "secrets", id: "/restaurant-cli/resy_authToken" };
    expect(redact({ tokenRef: ref })).toEqual({ tokenRef: ref });
  });

  it("recurses into nested providers and arrays", () => {
    expect(
      redact({
        providers: {
          resy: { email: "a@b.com", token: "secret-tok" },
        },
        list: [{ apiKey: "k1" }, { name: "ok" }],
      }),
    ).toEqual({
      providers: { resy: { email: "a@b.com", token: "***redacted***" } },
      list: [{ apiKey: "***redacted***" }, { name: "ok" }],
    });
  });

  it("leaves non-secret scalars untouched", () => {
    expect(redact({ partySize: 2, timezone: "America/Los_Angeles" })).toEqual({
      partySize: 2,
      timezone: "America/Los_Angeles",
    });
  });
});
