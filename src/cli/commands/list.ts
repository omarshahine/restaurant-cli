import { defineCommand } from "citty";

export const listCommand = defineCommand({
  meta: { name: "list", description: "List upcoming reservations (M2)" },
  run() {
    throw new Error("`restaurant list` lands in M2.");
  },
});
