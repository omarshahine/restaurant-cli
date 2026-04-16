import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ScheduledJob } from "./index.js";

/**
 * Compute per-call so env overrides (especially XDG_STATE_HOME used in tests)
 * are honored. Don't capture the path at module load time.
 */
export function jobsFilePath(): string {
  const stateDir = process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state");
  return join(stateDir, "restaurant-cli", "jobs.json");
}

interface PersistedJob extends Omit<ScheduledJob, "runAt"> {
  runAt: string; // ISO
}

export function loadJobs(): ScheduledJob[] {
  const f = jobsFilePath();
  if (!existsSync(f)) return [];
  try {
    const arr = JSON.parse(readFileSync(f, "utf8")) as PersistedJob[];
    return arr.map((j) => ({ ...j, runAt: new Date(j.runAt) }));
  } catch {
    return [];
  }
}

export function saveJobs(jobs: ScheduledJob[]): void {
  const f = jobsFilePath();
  mkdirSync(dirname(f), { recursive: true });
  const persisted: PersistedJob[] = jobs.map((j) => ({ ...j, runAt: j.runAt.toISOString() }));
  writeFileSync(f, JSON.stringify(persisted, null, 2), { mode: 0o600 });
}
