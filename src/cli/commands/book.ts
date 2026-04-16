import { defineCommand } from "citty";

export const bookCommand = defineCommand({
  meta: { name: "book", description: "Book a reservation (M2)" },
  run() {
    throw new Error("`restaurant book` lands in M2.");
  },
});
