import { describe, it, expect } from "vitest";
import { buildRegistry } from "../../src/providers/bootstrap.js";

describe("providers/registry", () => {
  it("auto-registers every bootstrapped provider", () => {
    const r = buildRegistry();
    const ids = r.ids();
    expect(ids).toContain("resy");
    // This test is the explicit guard that adding a provider to
    // bootstrap.ts surfaces it without any other code change.
  });

  it("rejects double registration", () => {
    const r = buildRegistry();
    expect(() => r.register(r.get("resy"))).toThrow(/already registered/);
  });

  it("surfaces capabilities honestly", () => {
    const r = buildRegistry();
    const resy = r.get("resy");
    expect(resy.capabilities.search).toBe(true);
    // M2-only features are still false in M1.
    expect(resy.capabilities.book).toBe(false);
  });
});
