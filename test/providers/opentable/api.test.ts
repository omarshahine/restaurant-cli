import { describe, it, expect, beforeEach } from "vitest";
import {
  parseRestaurantPageHtml,
  resetSession,
  lookupRestaurantId,
  gqlAvailability,
  getAvailabilityHash,
} from "../../../src/providers/opentable/api.js";
import { parseGqlAvailabilityResponse } from "../../../src/providers/opentable/availability.js";

beforeEach(() => {
  resetSession();
  delete process.env["OPENTABLE_AVAILABILITY_HASH"];
});

describe("providers/opentable/api — parseRestaurantPageHtml", () => {
  it("extracts ID + name from the primary-window-vars script tag", () => {
    const html = `
      <html><head>
      <script id="primary-window-vars" type="application/json">
      {"windowVariables":{"__OT_GA_DATA__":{"cd1":"Carbone","cd6":"8033"}}}
      </script>
      </head><body></body></html>
    `;
    const r = parseRestaurantPageHtml(html, "carbone-new-york");
    expect(r).toEqual({
      restaurantId: "8033",
      slug: "carbone-new-york",
      name: "Carbone",
    });
  });

  it("falls back to a regex when window-vars is absent", () => {
    const html = `<script>{"foo":1,"restaurantId":12345,"bar":2}</script>`;
    expect(parseRestaurantPageHtml(html, "x")).toEqual({
      restaurantId: "12345",
      slug: "x",
    });
  });

  it("returns null when neither is present", () => {
    expect(parseRestaurantPageHtml("<html></html>", "x")).toBeNull();
  });

  it("survives invalid JSON in window-vars by falling back to regex", () => {
    const html = `
      <script id="primary-window-vars" type="application/json">{not json</script>
      <script>"restaurantId":99</script>
    `;
    expect(parseRestaurantPageHtml(html, "x")).toEqual({
      restaurantId: "99",
      slug: "x",
    });
  });
});

describe("providers/opentable/availability — parseGqlAvailabilityResponse", () => {
  it("converts timeOffsetMinutes from a 19:00 anchor to absolute HH:mm", () => {
    const raw = {
      data: {
        availability: [
          {
            availabilityDays: [
              {
                slots: [
                  { isAvailable: true, timeOffsetMinutes: -30, slotHash: "a" },
                  { isAvailable: true, timeOffsetMinutes: 0, slotHash: "b" },
                  { isAvailable: true, timeOffsetMinutes: 30, slotHash: "c" },
                  { isAvailable: true, timeOffsetMinutes: 90, slotHash: "d" },
                ],
              },
            ],
          },
        ],
      },
    };
    const slots = parseGqlAvailabilityResponse(raw, {
      venueId: "8033",
      date: "2026-05-01",
      partySize: 2,
    });
    expect(slots.map((s) => s.time)).toEqual(["18:30", "19:00", "19:30", "20:30"]);
    expect(slots[0]!.token).toContain("rid=8033");
    expect(slots[0]!.token).toContain("partysize=2");
    expect(slots[0]!.configId).toBe("a");
  });

  it("honors a non-default anchor time", () => {
    const raw = {
      data: {
        availability: [
          {
            availabilityDays: [
              { slots: [{ isAvailable: true, timeOffsetMinutes: 30 }] },
            ],
          },
        ],
      },
    };
    const slots = parseGqlAvailabilityResponse(raw, {
      venueId: "1",
      date: "2026-05-01",
      partySize: 4,
      anchorTime: "12:00",
    });
    expect(slots[0]!.time).toBe("12:30");
  });

  it("drops slots with isAvailable === false but keeps undefined", () => {
    const raw = {
      data: {
        availability: [
          {
            availabilityDays: [
              {
                slots: [
                  { isAvailable: false, timeOffsetMinutes: 0 },
                  { isAvailable: true, timeOffsetMinutes: 30 },
                  { timeOffsetMinutes: 60 }, // undefined → kept
                ],
              },
            ],
          },
        ],
      },
    };
    const slots = parseGqlAvailabilityResponse(raw, {
      venueId: "1",
      date: "2026-05-01",
      partySize: 2,
    });
    expect(slots.map((s) => s.time)).toEqual(["19:30", "20:00"]);
  });

  it("returns [] when availability is empty or restaurant is null", () => {
    expect(
      parseGqlAvailabilityResponse(
        { data: { availability: [] } },
        { venueId: "1", date: "2026-05-01", partySize: 2 },
      ),
    ).toEqual([]);
    expect(
      parseGqlAvailabilityResponse(
        { data: { availability: [null] } },
        { venueId: "1", date: "2026-05-01", partySize: 2 },
      ),
    ).toEqual([]);
    expect(
      parseGqlAvailabilityResponse(
        { data: {} },
        { venueId: "1", date: "2026-05-01", partySize: 2 },
      ),
    ).toEqual([]);
  });

  it("preserves type when present", () => {
    const raw = {
      data: {
        availability: [
          {
            availabilityDays: [
              {
                slots: [
                  {
                    isAvailable: true,
                    timeOffsetMinutes: 0,
                    type: "Standard",
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const slots = parseGqlAvailabilityResponse(raw, {
      venueId: "1",
      date: "2026-05-01",
      partySize: 2,
    });
    expect(slots[0]!.type).toBe("Standard");
  });
});

describe("providers/opentable/api — getAvailabilityHash", () => {
  it("uses the default hash when no env override is set", () => {
    expect(getAvailabilityHash()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("respects OPENTABLE_AVAILABILITY_HASH env var", () => {
    process.env["OPENTABLE_AVAILABILITY_HASH"] = "deadbeef";
    expect(getAvailabilityHash()).toBe("deadbeef");
  });
});

describe("providers/opentable/api — lookupRestaurantId (mocked transport)", () => {
  it("acquires CSRF from homepage, then parses /r/<slug>", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string | URL): Promise<Response> => {
      const u = typeof url === "string" ? url : url.toString();
      calls.push(u);
      if (u.endsWith("/")) {
        return new Response(
          `<html><script>"__CSRF_TOKEN__":"csrf-abc"</script></html>`,
          {
            status: 200,
            headers: {
              "set-cookie": "OT_session=abc; Path=/",
              "content-type": "text/html",
            },
          },
        );
      }
      // /r/<slug>
      return new Response(
        `<script id="primary-window-vars">{"windowVariables":{"__OT_GA_DATA__":{"cd1":"Foo","cd6":"42"}}}</script>`,
        { status: 200, headers: { "content-type": "text/html" } },
      );
    }) as unknown as typeof fetch;

    const r = await lookupRestaurantId("foo-bar", { fetchImpl: fakeFetch });
    expect(r).toEqual({ restaurantId: "42", slug: "foo-bar", name: "Foo" });
    expect(calls).toEqual([
      "https://www.opentable.com/",
      "https://www.opentable.com/r/foo-bar",
    ]);
  });

  it("throws ProviderError on non-200 from /r/<slug>", async () => {
    const fakeFetch = (async (url: string | URL): Promise<Response> => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.endsWith("/")) {
        return new Response(
          `<html><script>"__CSRF_TOKEN__":"csrf"</script></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      return new Response("forbidden", { status: 403 });
    }) as unknown as typeof fetch;

    await expect(
      lookupRestaurantId("nope", { fetchImpl: fakeFetch }),
    ).rejects.toThrow(/403/);
  });
});

describe("providers/opentable/api — gqlAvailability (mocked transport)", () => {
  it("sends the persisted query hash + CSRF + cookies to /dapi/fe/gql", async () => {
    let postReq: Request | null = null;
    const fakeFetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const u =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (u.endsWith("/")) {
        return new Response(
          `<html><script>"__CSRF_TOKEN__":"csrf-xyz"</script></html>`,
          {
            status: 200,
            headers: {
              "set-cookie": "OT_session=zzz; Path=/",
              "content-type": "text/html",
            },
          },
        );
      }
      // GQL POST
      postReq = new Request(u, init);
      return new Response(
        JSON.stringify({
          data: {
            availability: [
              {
                availabilityDays: [
                  {
                    slots: [
                      { isAvailable: true, timeOffsetMinutes: 0, slotHash: "x" },
                    ],
                  },
                ],
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const raw = await gqlAvailability(
      { restaurantId: "8033", date: "2026-05-01", partySize: 2 },
      { fetchImpl: fakeFetch, hash: "test-hash-123" },
    );

    expect(raw).toMatchObject({
      data: { availability: [{ availabilityDays: [{ slots: [{ slotHash: "x" }] }] }] },
    });
    expect(postReq).not.toBeNull();
    expect(postReq!.url).toContain("opname=RestaurantsAvailability");
    expect(postReq!.headers.get("x-csrf-token")).toBe("csrf-xyz");
    expect(postReq!.headers.get("cookie")).toContain("OT_session=zzz");
    const body = await postReq!.text();
    expect(body).toContain("test-hash-123");
    expect(body).toContain('"restaurantIds":[8033]');
    expect(body).toContain('"partySize":2');
  });

  it("throws ProviderError when GQL returns 403", async () => {
    const fakeFetch = (async (input: string | URL | Request): Promise<Response> => {
      const u =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (u.endsWith("/")) {
        return new Response(
          `<html><script>"__CSRF_TOKEN__":"csrf"</script></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      return new Response("Access Denied", { status: 403 });
    }) as unknown as typeof fetch;

    await expect(
      gqlAvailability(
        { restaurantId: "1", date: "2026-05-01", partySize: 2 },
        { fetchImpl: fakeFetch },
      ),
    ).rejects.toThrow(/403/);
  });
});
