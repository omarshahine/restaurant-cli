import { defineCommand } from "citty";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { execSync } from "node:child_process";
import { buildRegistry } from "../../providers/bootstrap.js";
import { loadConfig } from "../../core/config.js";
import { CapabilityError } from "../../core/errors.js";
import { parseReleaseAt } from "../../core/time.js";
import { createAtScheduler } from "../../scheduler/at.js";
import { confirmTTY } from "../prompts.js";

/**
 * Resolve the absolute path to the `restaurant` binary so the at-job can
 * invoke it under a restricted `at` environment.
 *
 * Preference order:
 *   1. `which restaurant` (works when the package is on $PATH — npm i -g or npm link)
 *   2. realpath of process.argv[1] (works when invoked as `node dist/bin/restaurant.js`)
 *   3. fall through to bare "restaurant" (at-daemon's PATH may or may not find it)
 */
function resolveCliBinary(): string {
  try {
    const out = execSync("which restaurant", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    if (out) return out;
  } catch {
    // which failed — fall through
  }
  try {
    return realpathSync(process.argv[1] ?? "restaurant");
  } catch {
    return "restaurant";
  }
}

export const snipeCommand = defineCommand({
  meta: {
    name: "snipe",
    description: "Queue a booking to fire at a specific release time",
  },
  args: {
    venue: { type: "string", description: "Venue id", required: true },
    date: { type: "string", description: "Date (YYYY-MM-DD)", required: true },
    time: { type: "string", description: "Time (HH:mm)", required: true },
    party: { type: "string", description: "Party size", default: "2" },
    "release-at": {
      type: "string",
      description:
        "When the booking window opens (ISO8601 with timezone offset, e.g. 2026-04-30T10:00-07:00)",
      required: true,
    },
    provider: { type: "string", description: "Provider id", default: "" },
    notes: { type: "string", description: "Optional notes to send to the venue", default: "" },
    yes: { type: "boolean", description: "Skip confirmation prompt", default: false },
  },
  async run({ args }) {
    const config = loadConfig();
    const registry = buildRegistry();
    const providerId = args.provider || config.defaults.provider;
    const provider = registry.get(providerId);
    if (!provider.capabilities.snipe) {
      throw new CapabilityError(provider.id, "snipe");
    }

    const runAt = parseReleaseAt(args["release-at"]);
    if (runAt.getTime() <= Date.now()) {
      throw new Error(
        `--release-at must be in the future. Got ${runAt.toISOString()} which is already past.`,
      );
    }

    if (!args.yes) {
      const ok = await confirmTTY(
        `Queue ${providerId} snipe for venue ${args.venue} on ${args.date} at ${args.time} ` +
          `(party of ${args.party}), firing at ${runAt.toISOString()}?`,
      );
      if (!ok) {
        // eslint-disable-next-line no-console
        console.log("Aborted. No job was queued.");
        return;
      }
    }

    // Build the at-job's command: self-invoke `restaurant book` with --yes
    // so the at-runtime has nothing to prompt for. The book command will
    // re-run availability against the freshly opened slots and match by time.
    const bin = resolveCliBinary();
    const parts = [
      shellQuote(bin),
      "book",
      "--venue",
      shellQuote(args.venue),
      "--date",
      shellQuote(args.date),
      "--time",
      shellQuote(args.time),
      "--party",
      shellQuote(args.party),
      "--provider",
      shellQuote(providerId),
      "--yes",
      "--json",
    ];
    if (args.notes) {
      parts.push("--notes", shellQuote(args.notes));
    }
    const command = parts.join(" ");

    const jobId = `snipe-${runAt.toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;

    const sched = createAtScheduler();
    await sched.schedule({
      id: jobId,
      command,
      runAt,
      providerId,
      metadata: {
        venueId: args.venue,
        date: args.date,
        time: args.time,
        partySize: Number(args.party),
      },
    });

    const atJobId = (await sched.list()).find((j) => j.id === jobId)?.metadata?.atJobId;
    // eslint-disable-next-line no-console
    console.log(
      `Queued snipe ${jobId} (at-job ${atJobId ?? "?"}) to fire at ${runAt.toISOString()}.`,
    );
    // eslint-disable-next-line no-console
    console.log(`Logs: ${sched.logFilePath(jobId)}`);
  },
});

/**
 * Minimal shell-quote: wrap in single quotes and escape inner single quotes
 * with the standard '\\''' dance. Safe for bash-style invocation.
 */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
