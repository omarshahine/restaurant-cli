import { defineCommand } from "citty";
import { existsSync, readFileSync } from "node:fs";
import { createAtScheduler } from "../../scheduler/at.js";
import { confirmTTY } from "../prompts.js";

const listCmd = defineCommand({
  meta: { name: "list", description: "List all scheduled snipe jobs" },
  args: {
    json: { type: "boolean", description: "Output raw JSON" },
  },
  async run({ args }) {
    const sched = createAtScheduler();
    const jobs = await sched.list();
    if (args.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(jobs, null, 2));
      return;
    }
    if (jobs.length === 0) {
      // eslint-disable-next-line no-console
      console.log("No scheduled jobs.");
      return;
    }
    for (const j of jobs) {
      const atJobId = j.metadata?.atJobId ?? "?";
      // eslint-disable-next-line no-console
      console.log(
        `${j.id}  provider=${j.providerId}  at-job=${atJobId}  runAt=${j.runAt.toISOString()}`,
      );
      // eslint-disable-next-line no-console
      console.log(`  ${j.command}`);
    }
  },
});

const cancelCmd = defineCommand({
  meta: { name: "cancel", description: "Cancel a scheduled snipe by job id" },
  args: {
    id: { type: "positional", description: "Job id", required: true },
    yes: { type: "boolean", description: "Skip confirmation prompt", default: false },
  },
  async run({ args }) {
    const sched = createAtScheduler();
    if (!args.yes) {
      const ok = await confirmTTY(`Cancel scheduled job ${args.id}?`);
      if (!ok) {
        // eslint-disable-next-line no-console
        console.log("Aborted. Job not cancelled.");
        return;
      }
    }
    const ok = await sched.cancel(args.id);
    if (ok) {
      // eslint-disable-next-line no-console
      console.log(`Cancelled ${args.id}.`);
    } else {
      // eslint-disable-next-line no-console
      console.error(`No job with id "${args.id}".`);
      process.exitCode = 4;
    }
  },
});

const logsCmd = defineCommand({
  meta: {
    name: "logs",
    description: "Show the fire-time log for a scheduled snipe (start/end JSONL + book output)",
  },
  args: {
    id: { type: "positional", description: "Job id", required: true },
  },
  async run({ args }) {
    const sched = createAtScheduler();
    const path = sched.logFilePath(args.id);
    if (!existsSync(path)) {
      // eslint-disable-next-line no-console
      console.error(
        `No log file for "${args.id}" yet. (Does the id exist? Try: restaurant jobs list)`,
      );
      process.exitCode = 4;
      return;
    }
    const content = readFileSync(path, "utf8");
    if (content.length === 0) {
      // eslint-disable-next-line no-console
      console.log(`(${path} exists but is empty — job probably hasn't fired yet)`);
      return;
    }
    // eslint-disable-next-line no-console
    process.stdout.write(content);
  },
});

export const jobsCommand = defineCommand({
  meta: {
    name: "jobs",
    description: "Manage scheduled snipe jobs (list / cancel / logs)",
  },
  subCommands: {
    list: listCmd,
    cancel: cancelCmd,
    logs: logsCmd,
  },
  // NOTE: no default `run`. citty invokes the parent `run` as a pre-hook
  // whenever a subcommand fires, so adding one causes every
  // `restaurant jobs list|cancel|logs` call to double-print. Users who want
  // a bare listing run `restaurant jobs list`.
});
