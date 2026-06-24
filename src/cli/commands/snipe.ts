import { defineCommand } from "citty";
import { randomUUID } from "node:crypto";
import { buildRegistry } from "../../providers/bootstrap.js";
import { loadConfig } from "../../core/config.js";
import { CapabilityError, UsageError } from "../../core/errors.js";
import { parseReleaseAt } from "../../core/time.js";
import { resolveCliBinary, shellQuote } from "../../core/shell.js";
import { createAtScheduler } from "../../scheduler/at.js";
import { confirmTTY } from "../prompts.js";
import { AGENT_ARGS, emit, parseAgentArgs } from "../output.js";
import { warnUnattendedSnipe } from "../../core/warnings.js";
import { requireSnipeEnabled } from "../../core/gates.js";

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
    notes: {
      type: "string",
      description: "Optional notes to send to the venue",
      default: "",
    },
    ...AGENT_ARGS,
  },
  async run({ args }) {
    const agentArgs = parseAgentArgs(
      args as unknown as Record<string, unknown>,
    );
    const config = loadConfig();
    const registry = buildRegistry();
    const providerId = args.provider || config.defaults.provider;
    const provider = registry.get(providerId);
    if (!provider.capabilities.snipe) {
      throw new CapabilityError(provider.id, "snipe");
    }

    const runAt = parseReleaseAt(args["release-at"]);
    if (runAt.getTime() <= Date.now()) {
      throw new UsageError(
        `--release-at must be in the future. Got ${runAt.toISOString()} which is already past.`,
      );
    }

    if (agentArgs.dryRun) {
      const envelope = {
        ok: true,
        dryRun: true,
        provider: providerId,
        request: {
          venueId: args.venue,
          date: args.date,
          time: args.time,
          partySize: Number(args.party),
          runAt: runAt.toISOString(),
        },
      };
      emit(envelope, agentArgs, {
        human: () =>
          `DRY RUN — would queue ${providerId} snipe for venue ${args.venue} on ${args.date} at ${args.time} (party of ${args.party}), firing at ${runAt.toISOString()}`,
      });
      return;
    }

    // Off by default: scheduled sniping is an unattended booking. Require
    // explicit opt-in before queuing anything (dry-run above is exempt — it
    // only previews and queues nothing).
    requireSnipeEnabled();

    // Disclose that this fires unattended and books with --yes at release time.
    warnUnattendedSnipe();

    if (!agentArgs.yes) {
      const ok = await confirmTTY(
        `Queue ${providerId} snipe for venue ${args.venue} on ${args.date} at ${args.time} ` +
          `(party of ${args.party}), firing at ${runAt.toISOString()}?`,
        { noInput: agentArgs.noInput },
      );
      if (!ok) {
        process.stdout.write("Aborted. No job was queued.\n");
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
      "--idempotent",
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

    const atJobId = (await sched.list()).find((j) => j.id === jobId)?.metadata
      ?.atJobId;
    const result = {
      ok: true,
      jobId,
      atJobId: atJobId ?? null,
      runAt: runAt.toISOString(),
      logFile: sched.logFilePath(jobId),
    };
    emit(result, agentArgs, {
      human: () => [
        `Queued snipe ${jobId} (at-job ${atJobId ?? "?"}) to fire at ${runAt.toISOString()}.`,
        `Logs: ${sched.logFilePath(jobId)}`,
      ],
    });
  },
});
