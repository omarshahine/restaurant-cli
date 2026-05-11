import { describe, it, expect } from "vitest";
import { bookableTimesToSlots } from "../../../src/providers/tock/availability.js";
import type { TrgAvailabilityResult } from "../../../src/providers/tock/trg.js";

describe("tock/availability.bookableTimesToSlots", () => {
  it("converts a trg multi-time envelope to Slot[]", () => {
    const result: TrgAvailabilityResult = {
      available: true,
      network: "tock",
      venue: "canlis",
      url: "https://www.exploretock.com/canlis",
      bookable_times: [
        "2026-05-12T17:00",
        "2026-05-12T17:15",
        "2026-05-12T20:15",
      ],
    };
    const slots = bookableTimesToSlots(result, "2026-05-12", "canlis");
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.time)).toEqual(["17:00", "17:15", "20:15"]);
    expect(slots[0]?.token).toBe("2026-05-12|17:00|tock:canlis");
  });

  it("returns [] when not available", () => {
    expect(
      bookableTimesToSlots(
        { available: false, network: "tock", venue: "canlis" },
        "2026-05-12",
        "canlis",
      ),
    ).toEqual([]);
  });

  it("filters out slot times that belong to a different date", () => {
    const result: TrgAvailabilityResult = {
      available: true,
      network: "tock",
      venue: "canlis",
      bookable_times: ["2026-05-12T20:00", "2026-05-13T17:00"],
    };
    const slots = bookableTimesToSlots(result, "2026-05-12", "canlis");
    expect(slots.map((s) => s.time)).toEqual(["20:00"]);
  });

  it("sorts by time ascending", () => {
    const result: TrgAvailabilityResult = {
      available: true,
      network: "tock",
      venue: "x",
      bookable_times: ["2026-05-12T20:00", "2026-05-12T17:00", "2026-05-12T19:30"],
    };
    expect(bookableTimesToSlots(result, "2026-05-12", "x").map((s) => s.time)).toEqual([
      "17:00",
      "19:30",
      "20:00",
    ]);
  });

  it("skips malformed ISO strings", () => {
    const result: TrgAvailabilityResult = {
      available: true,
      network: "tock",
      venue: "x",
      bookable_times: ["nope", "2026-05-12T19:00", ""],
    };
    expect(bookableTimesToSlots(result, "2026-05-12", "x").map((s) => s.time)).toEqual([
      "19:00",
    ]);
  });
});
