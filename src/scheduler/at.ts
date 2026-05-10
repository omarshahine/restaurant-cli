import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { ScheduledJob, Scheduler } from "./index.js";
import { loadJobs, saveJobs } from "./store.js";
import { runCli, spawnProcess, whichBinary } from "../core/safe-shell.js";

/**
 * POSIX `at` backend.
 *
 * On schedule(): pipes the job's command to `at -t YYYYMMDDHHMM`, parses the
 * resulting "job N" line from stderr, and persists the mapping to
 * jobs.json so `restaurant jobs list` / `cancel` can round-trip without
 * re-asking `atq`.
 *
 * On cancel(): calls `atrm <atJobId>` and removes the local metadata row.
 *
 * Why `-t YYYYMMDDHHMM`: macOS `at` accepts a dozen different time formats
 * (`10:00`, `10:00 04/30/2026`, `now + 5 minutes`) but `-t` is the only one
 * that's unambiguous and portable — it takes a literal POSIX timestamp
 * and never does heuristic parsing. That matters when `--release-at` is an
 * ISO8601 string with a timezone offset: we reduce it to venue-local wall
 * time here and hand `at` an exact minute.
 *
 * Known limitations:
 *   - `at` resolution is minutes, not seconds — sub-minute sniping isn't
 *     possible without a daemon backend (deferred).
 *   - `at` runs in a login-shell-equivalent environment; the scheduled
 *     command sources `~/.secrets.env` itself so `RESY_AUTH_TOKEN` is
 *     present at fire time even if the at-daemon was started before the
 *     user's shell first set the var.
 *
 * Optional DI hooks: `AtSchedulerDeps` lets tests swap out the side-effectful
 * `at`/`atrm` invocations. Production leaves them at defaults.
 */
export interface AtSchedulerDeps {
  enqueue?: (job: ScheduledJob) => Promise<string>;
  cancelAt?: (atJobId: string) => Promise<void>;
}

/**
 * Characters safe for interpolation into the bash wrapper script without
 * additional quoting. Keep this restrictive — a `$`, quote, or backtick in
 * a job id would break out of the `echo "..."` JSONL lines in
 * `buildWrapperScript`. The current snipe command produces IDs like
 * `snipe-2026-12-01T18-00-00-000Z-abcd1234` which match this regex; extending
 * the set requires rethinking the wrapper-script escaping.
 */
const JOB_ID_SAFE = /^[A-Za-z0-9_.\-:+]+$/;

export class AtScheduler implements Scheduler {
  readonly id = "at" as const;
  private readonly enqueueImpl: (job: ScheduledJob) => Promise<string>;
  private readonly cancelAtImpl: (atJobId: string) => Promise<void>;

  constructor(deps: AtSchedulerDeps = {}) {
    this.enqueueImpl = deps.enqueue ?? ((job) => this.enqueueViaAt(job));
    this.cancelAtImpl = deps.cancelAt ?? ((id) => this.cancelViaAtrm(id));
  }

  async schedule(job: ScheduledJob): Promise<void> {
    if (!JOB_ID_SAFE.test(job.id)) {
      // Defense in depth: job.id is interpolated into the bash wrapper script
      // without quoting (it lives inside JSONL echo lines + the jobs.json row
      // id). A shell-unsafe id would open a command-injection hole even if no
      // current caller produces one. Callers should prefer IDs matching the
      // regex above — see snipe.ts for the canonical format.
      throw new Error(
        `Unsafe job id "${job.id}" — allowed chars: A-Z a-z 0-9 _ . - : +`,
      );
    }
    const jobs = loadJobs();
    if (jobs.some((j) => j.id === job.id)) {
      throw new Error(`Job ${job.id} already scheduled`);
    }

    const atJobId = await this.enqueueImpl(job);
    const enriched: ScheduledJob = {
      ...job,
      metadata: { ...(job.metadata ?? {}), atJobId },
    };
    jobs.push(enriched);
    saveJobs(jobs);
  }

  async list(): Promise<ScheduledJob[]> {
    return loadJobs();
  }

  async cancel(jobId: string): Promise<boolean> {
    const jobs = loadJobs();
    const idx = jobs.findIndex((j) => j.id === jobId);
    if (idx === -1) return false;

    const atJobId = jobs[idx]?.metadata?.atJobId;
    if (typeof atJobId === "string" || typeof atJobId === "number") {
      try {
        await this.cancelAtImpl(String(atJobId));
      } catch (e) {
        // If atrm failed because the job already fired or was cancelled
        // externally, we still want to drop our local metadata row.
        const msg = (e as Error).message;
        if (!/Cannot find job|not found/i.test(msg)) {
          // An unexpected atrm failure: surface it but don't leave the
          // local row orphaned — that would block re-scheduling the same id.
          // eslint-disable-next-line no-console
          console.warn(`atrm ${atJobId} failed: ${msg}`);
        }
      }
    }
    jobs.splice(idx, 1);
    saveJobs(jobs);
    return true;
  }

  private async cancelViaAtrm(atJobId: string): Promise<void> {
    await runCli("atrm", [atJobId]);
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    const atPath = whichBinary("at");
    if (atPath) {
      return { ok: true, detail: atPath };
    }
    return {
      ok: false,
      detail:
        'POSIX `at` not found on PATH. On macOS enable it with `sudo launchctl load -w /System/Library/LaunchDaemons/com.apple.atrun.plist`.',
    };
  }

  /**
   * Pipe the job to `at -t <timestamp>` and return the numeric at-job id
   * parsed from stderr. Throws if `at` isn't available or the output shape
   * changes — we'd rather crash loudly than persist an un-cancellable row.
   */
  private async enqueueViaAt(job: ScheduledJob): Promise<string> {
    // Build a tiny wrapper script so the scheduled command runs in a
    // predictable env. This matters because `at` strips most of the user's
    // shell environment.
    const script = this.buildWrapperScript(job);

    // Format runAt as POSIX `-t YYYYMMDDHHMM` in LOCAL time (what `at` expects).
    const t = localTimestamp(job.runAt);

    const atJobId = await new Promise<string>((resolve, reject) => {
      const child = spawnProcess("at", ["-t", t], { stdio: ["pipe", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`\`at -t ${t}\` exited ${code}: ${stderr.trim()}`));
          return;
        }
        // macOS at prints: "job 42 at Thu Apr 30 10:00:00 2026"
        const m = /job\s+(\d+)/.exec(stderr);
        if (!m) {
          reject(new Error(`Couldn't parse 'at' output: ${stderr.trim()}`));
          return;
        }
        resolve(m[1]!);
      });
      child.stdin.write(script);
      child.stdin.end();
    });

    return atJobId;
  }

  /**
   * Write the command inside a shell wrapper that:
   *   - imports ONLY restaurant-cli provider tokens from ~/.secrets.env
   *     (e.g. RESY_AUTH_TOKEN). Sourcing the entire env file would
   *     expose unrelated secrets (database URLs, GitHub tokens, etc.)
   *     to the scheduled `at` job. Filtering to a small allowlist keeps
   *     the booking process restricted to the credentials it actually
   *     needs.
   *   - redirects all output to a per-job log file under XDG_STATE_HOME
   *   - emits a tight JSONL line at start + end for `restaurant jobs logs`
   *
   * The result snippet is fed to `at` on stdin.
   */
  private buildWrapperScript(job: ScheduledJob): string {
    const logFile = this.logFilePath(job.id);
    mkdirSync(dirname(logFile), { recursive: true });

    // Pre-create the file so a 0-byte log exists even if at-runtime errors
    // prevent the wrapper from ever writing.
    if (!existsSync(logFile)) {
      appendFileSync(logFile, "", { mode: 0o600 });
    }

    // Provider tokens this CLI may need at fire time. Add new providers
    // here when they ship; unrelated env vars stay isolated.
    const allowedKeys = [
      "RESY_API_KEY",
      "RESY_AUTH_TOKEN",
      "OPENTABLE_AUTH_TOKEN",
      "OPENTABLE_SESSION_COOKIES",
      "TOCK_AUTH_TOKEN",
      "TOCK_SESSION_COOKIES",
      "TOCK_CVC",
      "SEVENROOMS_AUTH_TOKEN",
    ];
    // Anchor each key in a regex alternation. We use `eval` on the matched
    // `export KEY=...` lines rather than `source`-ing the file so unrelated
    // exports never enter the wrapper's environment.
    const keyAlt = allowedKeys.join("|");

    // We wrap in `{ ... } >> log 2>&1` to capture both streams in order.
    // The JSONL start/end lines are precise enough for the jobs-logs UI to
    // tell whether the at-fire succeeded or crashed.
    const escaped = job.command.replace(/'/g, `'\\''`);
    const lines = [
      `#!/bin/bash`,
      `set +e`,
      `__rcli_import_keys() {`,
      `  local file="$1"`,
      `  [ -f "$file" ] || return 0`,
      `  eval "$(grep -E '^export (${keyAlt})=' "$file" 2>/dev/null || true)"`,
      `}`,
      `{`,
      `  __rcli_import_keys "$HOME/.secrets.env"`,
      `  __rcli_import_keys "$HOME/.secrets-macbook-pro.env"`,
      `  START_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)`,
      `  echo "{\\"ts\\":\\"$START_TS\\",\\"event\\":\\"snipe.start\\",\\"jobId\\":\\"${job.id}\\"}"`,
      `  ${escaped}`,
      `  EXIT=$?`,
      `  END_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)`,
      `  echo "{\\"ts\\":\\"$END_TS\\",\\"event\\":\\"snipe.end\\",\\"jobId\\":\\"${job.id}\\",\\"exit\\":$EXIT}"`,
      `} >> '${logFile.replace(/'/g, `'\\''`)}' 2>&1`,
      ``,
    ];
    return lines.join("\n");
  }

  /** Per-job log file path. Exposed so the `jobs logs` command can read it. */
  logFilePath(jobId: string): string {
    const stateDir = process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state");
    return join(stateDir, "restaurant-cli", "logs", `${jobId}.log`);
  }
}

export function createAtScheduler(deps?: AtSchedulerDeps): AtScheduler {
  return new AtScheduler(deps);
}

/**
 * Format a Date as the POSIX `at -t` timestamp (YYYYMMDDHHMM) in LOCAL time.
 * `at` interprets `-t` in the machine's local timezone, which is why we don't
 * normalize to UTC here — that would scheduler-shift by the tz offset.
 */
export function localTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes())
  );
}
