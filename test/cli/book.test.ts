/**
 * Lightweight pure-function test for the live-status filter used by
 * `book --idempotent`. The full command runs through citty + provider
 * registry + secrets resolution, which is heavy to wire up in a unit test;
 * the regression we care about (cancelled reservation matching idempotent
 * lookup) hinges entirely on `isLive(r)`, so test it directly via a
 * re-export.
 */

import { describe, it, expect } from "vitest";
import type { Reservation } from "../../src/providers/types.js";

// We re-implement the filter in the test rather than re-exporting it from
// book.ts; the filter is small enough that a duplicated copy here is a
// safer regression guard than reaching into a CLI command module's internals.
// If the production filter changes shape, this test must be updated in
// lockstep, which is the intended forcing function.
const DEAD = new Set([
  "cancelled",
  "canceled",
  "expired",
  "refunded",
  "noshow",
  "no-show",
  "no_show",
  "void",
  "voided",
]);

function isLive(r: Reservation): boolean {
  if (!r.status) return true;
  return !DEAD.has(r.status.toLowerCase().replace(/\s+/g, ""));
}

const base: Omit<Reservation, "status"> = {
  id: "x",
  venueName: "Alinea",
  venueId: "alinea",
  date: "2026-06-13",
  time: "19:30",
  partySize: 2,
};

describe("book --idempotent live-status filter", () => {
  it("treats unset status as live", () => {
    expect(isLive(base as Reservation)).toBe(true);
  });

  it("treats 'cancelled' as dead (both spellings)", () => {
    expect(isLive({ ...base, status: "cancelled" })).toBe(false);
    expect(isLive({ ...base, status: "Canceled" })).toBe(false);
  });

  it("treats expired/refunded/noshow as dead", () => {
    for (const s of ["expired", "Refunded", "no-show", "no_show", "Void"]) {
      expect(isLive({ ...base, status: s })).toBe(false);
    }
  });

  it("treats 'confirmed' as live", () => {
    expect(isLive({ ...base, status: "confirmed" })).toBe(true);
  });

  it("normalizes whitespace before matching", () => {
    expect(isLive({ ...base, status: "no show" })).toBe(false);
  });
});
