import { defineCommand, runMain as citty } from "citty";
import { versionCommand } from "./commands/version.js";
import { setupCommand } from "./commands/setup.js";
import { searchCommand } from "./commands/search.js";
import { availabilityCommand } from "./commands/availability.js";
import { bookCommand } from "./commands/book.js";
import { snipeCommand } from "./commands/snipe.js";
import { listCommand } from "./commands/list.js";
import { cancelCommand } from "./commands/cancel.js";
import { jobsCommand } from "./commands/jobs.js";
import { configCommand } from "./commands/config.js";
import { doctorCommand } from "./commands/doctor.js";

const main = defineCommand({
  meta: {
    name: "restaurant",
    version: "0.1.0",
    description:
      "Pluggable CLI for booking restaurant reservations across Resy, OpenTable, Tock, and other providers",
  },
  subCommands: {
    setup: setupCommand,
    search: searchCommand,
    availability: availabilityCommand,
    book: bookCommand,
    snipe: snipeCommand,
    list: listCommand,
    cancel: cancelCommand,
    jobs: jobsCommand,
    config: configCommand,
    doctor: doctorCommand,
    version: versionCommand,
  },
});

export async function runMain(): Promise<void> {
  await citty(main);
}
