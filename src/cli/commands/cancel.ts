import { defineCommand } from "citty";

export const cancelCommand = defineCommand({
  meta: { name: "cancel", description: "Cancel a reservation (M2)" },
  run() {
    throw new Error("`restaurant cancel` lands in M2.");
  },
});
