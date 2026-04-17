import { describe, it, expect } from "vitest";
import { buildRegistry } from "../../src/providers/bootstrap.js";

describe("providers/registry", () => {
  it("auto-registers every bootstrapped provider", () => {
    const r = buildRegistry();
    const ids = r.ids();
    expect(ids).toContain("resy");
    expect(ids).toContain("opentable");
    // This test is the explicit guard that adding a provider to
    // bootstrap.ts surfaces it without any other code change.
  });

  it("rejects double registration", () => {
    const r = buildRegistry();
    expect(() => r.register(r.get("resy"))).toThrow(/already registered/);
  });

  it("surfaces capabilities honestly per-provider", () => {
    const r = buildRegistry();
    const resy = r.get("resy");
    expect(resy.capabilities.search).toBe(true);
    expect(resy.capabilities.book).toBe(false); // M2

    const ot = r.get("opentable");
    // OpenTable: browser-driven search is live (via patchright). Availability
    // + book + cancel + list still require more engineering (or will use
    // browser-automation that isn't wired yet) so they stay false.
    expect(ot.capabilities.search).toBe(true);
    expect(ot.capabilities.availability).toBe(false);
    expect(ot.capabilities.book).toBe(false);
    expect(ot.capabilities.bookUrl).toBe(true);
    expect(ot.getBookingUrl).toBeDefined();
  });
});
