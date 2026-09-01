import { describe, it, expect, afterEach } from "vitest";
import nock from "nock";
import { createOpenClawEntry } from "../../src/integrations/openclaw/index.js";
import { SNIPE_ENV } from "../../src/core/gates.js";

interface RegisteredTool {
  name: string;
  label: string;
  description: string;
  execute(id: string, params: Record<string, unknown>): Promise<ToolResult>;
}
interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: null;
}

function mountEntry(pluginConfig?: Record<string, unknown>): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  const api = {
    pluginConfig,
    registerTool(t: RegisteredTool) {
      tools.set(t.name, t);
    },
  };
  createOpenClawEntry().register(api);
  return tools;
}

describe("integrations/openclaw", () => {
  it("registers all expected tools", () => {
    const tools = mountEntry();
    expect([...tools.keys()].sort()).toEqual(
      [
        "restaurant_availability",
        "restaurant_book",
        "restaurant_cancel",
        "restaurant_list",
        "restaurant_schedule_snipe",
        "restaurant_search",
      ].sort(),
    );
  });

  it("search tool dispatches through the registry and returns JSON", async () => {
    nock("https://api.resy.com")
      .post("/3/venuesearch/search")
      .reply(200, {
        search: {
          hits: [{ objectID: "1387", name: "Le Bernardin", url_slug: "le-bernardin" }],
        },
      });

    const tools = mountEntry({ resy_authToken: "tok" });
    const result = await tools.get("restaurant_search")!.execute("call-1", {
      provider: "resy",
      query: "le bernardin",
    });
    const text = result.content[0]!.text;
    expect(text).toContain("Le Bernardin");
    expect(text).toContain("1387");
  });

  it("unknown provider returns an error tool result", async () => {
    const tools = mountEntry();
    const result = await tools.get("restaurant_search")!.execute("call-1", {
      provider: "nonexistent",
      query: "x",
    });
    expect(result.content[0]!.text).toMatch(/ERROR: Unknown provider: nonexistent/);
  });

  it("book on OpenTable gracefully falls back to bookUrl hand-off", async () => {
    const tools = mountEntry();
    const result = await tools.get("restaurant_book")!.execute("call-1", {
      provider: "opentable",
      venueId: "12345",
      date: "2026-05-15",
      time: "19:00",
      partySize: 2,
    });
    const text = result.content[0]!.text;
    expect(text).toMatch(/does not support API booking/);
    expect(text).toMatch(/opentable\.com\/restref\/client/);
  });

  it("a capability-false provider tool errors cleanly via the integration layer", async () => {
    // OpenTable.availability flipped to true once the GraphQL persisted-query
    // path landed (with a browser fallback). Cancel stays capability-false
    // because it requires a logged-in session, so it's the surviving guard
    // case for this test.
    const tools = mountEntry();
    const result = await tools.get("restaurant_cancel")!.execute("call-1", {
      provider: "opentable",
      reservationId: "rsv-1",
    });
    expect(result.content[0]!.text).toMatch(/does not support cancel/);
  });

  // Regression guard. RESTAURANT_CLI_ENABLE_SNIPE used to be enforced only in
  // cli/commands/snipe.ts, so the OpenClaw tool queued unattended bookings
  // with the gate off — contradicting skills/restaurant/SKILL.md, which
  // documents this tool as gated. Without these the next refactor reopens it
  // silently.
  describe("restaurant_schedule_snipe opt-in gate", () => {
    afterEach(() => {
      delete process.env[SNIPE_ENV];
    });

    it("refuses to queue a snipe when the env var is unset", async () => {
      delete process.env[SNIPE_ENV];
      const tools = mountEntry({ resy_authToken: "tok" });
      const result = await tools.get("restaurant_schedule_snipe")!.execute("call-1", {
        provider: "resy",
        venueId: "1387",
        date: "2030-05-15",
        time: "19:30",
        partySize: 2,
        releaseAt: "2030-05-01T10:00:00Z",
      });
      expect(result.content[0]!.text).toMatch(/Scheduled sniping is off by default/);
      expect(result.content[0]!.text).toContain(SNIPE_ENV);
    });

    it("refuses for any value other than exactly '1'", async () => {
      process.env[SNIPE_ENV] = "true";
      const tools = mountEntry({ resy_authToken: "tok" });
      const result = await tools.get("restaurant_schedule_snipe")!.execute("call-1", {
        provider: "resy",
        venueId: "1387",
        date: "2030-05-15",
        time: "19:30",
        partySize: 2,
        releaseAt: "2030-05-01T10:00:00Z",
      });
      expect(result.content[0]!.text).toMatch(/Scheduled sniping is off by default/);
    });

    it("gates before provider resolution, so it fails closed", async () => {
      delete process.env[SNIPE_ENV];
      const tools = mountEntry();
      const result = await tools.get("restaurant_schedule_snipe")!.execute("call-1", {
        provider: "nonexistent",
        venueId: "1387",
        date: "2030-05-15",
        time: "19:30",
        partySize: 2,
        releaseAt: "2030-05-01T10:00:00Z",
      });
      // The gate, not the unknown provider, is what answers.
      expect(result.content[0]!.text).toMatch(/Scheduled sniping is off by default/);
    });

    it("passes the gate when enabled, reaching normal validation", async () => {
      process.env[SNIPE_ENV] = "1";
      const tools = mountEntry({ resy_authToken: "tok" });
      const result = await tools.get("restaurant_schedule_snipe")!.execute("call-1", {
        provider: "resy",
        venueId: "1387",
        date: "2030-05-15",
        time: "19:30",
        partySize: 2,
        releaseAt: "2000-01-01T00:00:00Z", // in the past -> rejected downstream
      });
      // Past the gate: the complaint is now about the release time.
      expect(result.content[0]!.text).not.toMatch(/off by default/);
      expect(result.content[0]!.text).toMatch(/must be in the future/);
    });
  });

  it("tools return { content, details: null } consistently", async () => {
    const tools = mountEntry();
    for (const name of tools.keys()) {
      const result = await tools.get(name)!.execute("call-1", {
        provider: "nonexistent", // guaranteed to error out without hitting anything real
        query: "x",
        venueId: "1",
        date: "2026-05-15",
        time: "19:00",
        partySize: 2,
        reservationId: "r",
        releaseAt: "2030-01-01T00:00:00Z",
      });
      expect(result).toHaveProperty("content");
      expect(result.details).toBeNull();
      expect(Array.isArray(result.content)).toBe(true);
    }
  });
});
