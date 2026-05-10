import { describe, it, expect } from "vitest";
import { parseWithinDays } from "../../src/cli/commands/earliest.js";

describe("parseWithinDays", () => {
  it("parses '14d'", () => {
    expect(parseWithinDays("14d")).toBe(14);
  });
  it("parses a bare integer", () => {
    expect(parseWithinDays("7")).toBe(7);
  });
  it("rejects invalid input", () => {
    expect(() => parseWithinDays("fortnight")).toThrow(/must be like '14d'/);
  });
  it("rejects out-of-range", () => {
    expect(() => parseWithinDays("100d")).toThrow(/1..60 days/);
    expect(() => parseWithinDays("0")).toThrow(/1..60 days/);
  });
});
