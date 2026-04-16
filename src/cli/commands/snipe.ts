import { defineCommand } from "citty";

export const snipeCommand = defineCommand({
  meta: { name: "snipe", description: "Queue a booking for a future release time (M3)" },
  run() {
    throw new Error("`restaurant snipe` lands in M3.");
  },
});
