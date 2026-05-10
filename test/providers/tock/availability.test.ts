import { describe, it, expect } from "vitest";
import {
  parseAvailabilityResponse,
  parseTockTime,
} from "../../../src/providers/tock/availability.js";

describe("parseTockTime", () => {
  it("pulls HH:mm out of an ISO local string", () => {
    expect(parseTockTime("2026-05-15T19:00")).toBe("19:00");
  });
  it("passes a bare HH:mm through", () => {
    expect(parseTockTime("19:30")).toBe("19:30");
  });
  it("falls back to the original if no match", () => {
    expect(parseTockTime("???")).toBe("???");
  });
});

describe("parseAvailabilityResponse", () => {
  it("parses top-level slots", () => {
    const raw = {
      slots: [
        { token: "abc", start: "2026-05-15T19:00", experienceId: 1, experienceName: "Bar" },
      ],
    };
    const out = parseAvailabilityResponse(raw);
    expect(out).toEqual([
      { token: "abc", time: "19:00", configId: "1", type: "Bar", raw: raw.slots[0] },
    ]);
  });

  it("flattens experiences[].slots[]", () => {
    const raw = {
      experiences: [
        {
          id: 7,
          name: "Tasting",
          slots: [{ token: "tk1", start: "2026-05-15T19:30" }],
        },
      ],
    };
    const out = parseAvailabilityResponse(raw);
    expect(out).toHaveLength(1);
    expect(out[0]?.type).toBe("Tasting");
    expect(out[0]?.time).toBe("19:30");
  });

  it("skips slots without a time or token", () => {
    const raw = {
      slots: [{ token: "x" }, { start: "2026-05-15T19:00" }, { token: "ok", start: "2026-05-15T20:00" }],
    };
    expect(parseAvailabilityResponse(raw)).toHaveLength(1);
  });

  it("returns [] for empty/unknown shapes", () => {
    expect(parseAvailabilityResponse(null)).toEqual([]);
    expect(parseAvailabilityResponse({})).toEqual([]);
  });
});
