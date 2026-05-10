/**
 * Command tree, exported separately so `agent-context` can introspect the
 * full surface without re-importing the root command (which would create a
 * cycle through `commands/agent-context.ts` → `_tree.ts` → `index.ts`).
 *
 * Each `defineCommand` call returns a `CommandDef` parametrized on its
 * specific args object, but for the root subCommands map we just need the
 * structural shape — `CommandDef<ArgsDef>`. The cast is local; everywhere
 * else the individual command's narrow type is still preserved.
 */

import type { CommandDef } from "citty";
import { versionCommand } from "./version.js";
import { setupCommand } from "./setup.js";
import { searchCommand } from "./search.js";
import { availabilityCommand } from "./availability.js";
import { lookupCommand } from "./lookup.js";
import { bookCommand } from "./book.js";
import { snipeCommand } from "./snipe.js";
import { listCommand } from "./list.js";
import { cancelCommand } from "./cancel.js";
import { jobsCommand } from "./jobs.js";
import { configCommand } from "./config.js";
import { doctorCommand } from "./doctor.js";
import { agentContextCommand } from "./agent-context.js";
import { authCommand } from "./auth.js";
import { earliestCommand } from "./earliest.js";

export const commandTree = {
  setup: setupCommand,
  auth: authCommand,
  search: searchCommand,
  availability: availabilityCommand,
  earliest: earliestCommand,
  lookup: lookupCommand,
  book: bookCommand,
  snipe: snipeCommand,
  list: listCommand,
  cancel: cancelCommand,
  jobs: jobsCommand,
  config: configCommand,
  doctor: doctorCommand,
  "agent-context": agentContextCommand,
  version: versionCommand,
} as unknown as Record<string, CommandDef>;
