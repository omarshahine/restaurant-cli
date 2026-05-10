import { defineCommand } from "citty";
import { existsSync, readFileSync } from "node:fs";
import { createAtScheduler } from "../../scheduler/at.js";
import { confirmTTY } from "../prompts.js";
import { NotFoundError } from "../../core/errors.js";
import { AGENT_ARGS, emit, emitError, parseAgentArgs } from "../output.js";

const listCmd = defineCommand({
  meta: { name: "list", description: "List all scheduled snipe jobs" },
  args: { ...AGENT_ARGS },
  async run({ args }) {
    const agentArgs = parseAgentArgs(args as unknown as Record<string, unknown>);
    const sched = createAtScheduler();
    const jobs = await sched.list();
    emit(jobs, agentArgs, {
      empty: "No scheduled jobs.",
      human: (xs) => {
        const lines: string[] = [];
        for (const j of xs) {
          const atJobId = j.metadata?.atJobId ?? "?";
          lines.push(
            `${j.id}  provider=${j.providerId}  at-job=${atJobId}  runAt=${j.runAt.toISOString()}`,
          );
          lines.push(`  ${j.command}`);
        }
        return lines;
      },
    });
  },
});

const cancelCmd = defineCommand({
  meta: { name: "cancel", description: "Cancel a scheduled snipe by job id" },
  args: {
    id: { type: "positional", description: "Job id", required: true },
    ...AGENT_ARGS,
  },
  async run({ args }) {
    const agentArgs = parseAgentArgs(args as unknown as Record<string, unknown>);
    const sched = createAtScheduler();
    if (agentArgs.dryRun) {
      emit(
        { ok: true, dryRun: true, request: { jobId: args.id } },
        agentArgs,
        { human: () => `DRY RUN — would cancel job ${args.id}` },
      );
      return;
    }
    if (!agentArgs.yes) {
      const ok = await confirmTTY(`Cancel scheduled job ${args.id}?`, {
        noInput: agentArgs.noInput,
      });
      if (!ok) {
        process.stdout.write("Aborted. Job not cancelled.\n");
        return;
      }
    }
    const ok = await sched.cancel(args.id);
    if (ok) {
      emit({ ok: true, jobId: args.id }, agentArgs, {
        human: () => `Cancelled ${args.id}.`,
      });
    } else {
      emitError(`No job with id "${args.id}".`, agentArgs, {
        code: "not_found",
        exitCode: new NotFoundError("x").exitCode,
      });
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
    ...AGENT_ARGS,
  },
  async run({ args }) {
    const agentArgs = parseAgentArgs(args as unknown as Record<string, unknown>);
    const sched = createAtScheduler();
    const path = sched.logFilePath(args.id);
    if (!existsSync(path)) {
      emitError(
        `No log file for "${args.id}" yet. (Does the id exist? Try: restaurant jobs list)`,
        agentArgs,
        { code: "not_found", exitCode: new NotFoundError("x").exitCode },
      );
      return;
    }
    const content = readFileSync(path, "utf8");
    if (agentArgs.json) {
      // Logs are JSONL; for --json mode parse each line and emit an array.
      const lines = content
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const parsed: unknown[] = [];
      for (const line of lines) {
        try {
          parsed.push(JSON.parse(line));
        } catch {
          parsed.push({ raw: line });
        }
      }
      emit(parsed, agentArgs);
      return;
    }
    if (content.length === 0) {
      process.stdout.write(
        `(${path} exists but is empty — job probably hasn't fired yet)\n`,
      );
      return;
    }
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
