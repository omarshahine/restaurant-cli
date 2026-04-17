import { describe, it, expect } from "vitest";
import nock from "nock";
import { loginResy, RESY_PUBLIC_API_KEY } from "../../../src/providers/resy/auth.js";

describe("providers/resy/login", () => {
  it("exchanges email+password for a durable auth token", async () => {
    nock("https://api.resy.com")
      .post("/3/auth/password", /email=omar%40example\.com&password=hunter2/)
      .reply(200, {
        id: 424242,
        token: "eyJ0eXAiOiJKV1Q.jwt.here",
        first_name: "Omar",
        em_address: "omar@example.com",
      });

    const creds = await loginResy({ email: "omar@example.com", password: "hunter2" });
    expect(creds["authToken"]).toBe("eyJ0eXAiOiJKV1Q.jwt.here");
    expect(creds["apiKey"]).toBe(RESY_PUBLIC_API_KEY);
    expect(creds["email"]).toBe("omar@example.com");
    expect(creds["firstName"]).toBe("Omar");
    // Password must NEVER appear in the output creds — it is consumed and discarded.
    expect(creds["password"]).toBeUndefined();
  });

  it("throws a clear error when the API returns no token", async () => {
    nock("https://api.resy.com")
      .post("/3/auth/password")
      .reply(200, { message: "invalid credentials" });

    await expect(
      loginResy({ email: "bad@example.com", password: "wrong" }),
    ).rejects.toThrow(/no token/);
  });
});
