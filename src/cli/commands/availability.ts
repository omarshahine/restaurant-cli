import { defineCommand } from "citty";

export const availabilityCommand = defineCommand({
  meta: { name: "availability", description: "Show open time slots (M2)" },
  run() {
    throw new Error("`restaurant availability` lands in M2.");
  },
});
