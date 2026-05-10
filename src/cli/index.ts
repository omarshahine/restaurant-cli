import { defineCommand, runMain as citty } from "citty";
import { commandTree } from "./commands/_tree.js";

const main = defineCommand({
  meta: {
    name: "restaurant",
    version: "0.1.15",
    description:
      "Pluggable CLI for booking restaurant reservations across Resy, OpenTable, Tock, and other providers",
  },
  subCommands: commandTree,
});

export async function runMain(): Promise<void> {
  await citty(main);
}
