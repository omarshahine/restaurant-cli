import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ScheduledJob, Scheduler } from "./index.js";
import { loadJobs, saveJobs } from "./store.js";

const execFileAsync = promisify(execFile);

/**
 * POSIX `at` backend. Writes a self-invocation of the restaurant-cli binary to
 * the `at` daemon and persists the job metadata to jobs.json for listing.
 *
 * Execution wiring lands in M3; M1 ships the interface + metadata persistence
 * so the seam is visible to the CLI and OpenClaw integration from day one.
 */
export class AtScheduler implements Scheduler {
  readonly id = "at" as const;

  async schedule(job: ScheduledJob): Promise<void> {
    const jobs = loadJobs();
    if (jobs.some((j) => j.id === job.id)) {
      throw new Error(`Job ${job.id} already scheduled`);
    }
    // M3: actually enqueue via `at` here. For M1 we persist metadata only,
    // so `restaurant jobs list` shows pending snipes once the command lands.
    jobs.push(job);
    saveJobs(jobs);
  }

  async list(): Promise<ScheduledJob[]> {
    return loadJobs();
  }

  async cancel(jobId: string): Promise<boolean> {
    const jobs = loadJobs();
    const idx = jobs.findIndex((j) => j.id === jobId);
    if (idx === -1) return false;
    jobs.splice(idx, 1);
    saveJobs(jobs);
    return true;
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const { stdout } = await execFileAsync("which", ["at"]);
      return { ok: true, detail: stdout.trim() };
    } catch {
      return {
        ok: false,
        detail:
          'POSIX `at` not found on PATH. On macOS enable it with `sudo launchctl load -w /System/Library/LaunchDaemons/com.apple.atrun.plist`.',
      };
    }
  }
}

export function createAtScheduler(): AtScheduler {
  return new AtScheduler();
}
