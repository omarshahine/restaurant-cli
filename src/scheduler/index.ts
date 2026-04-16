export interface ScheduledJob {
  id: string;
  command: string;
  runAt: Date;
  providerId: string;
  metadata?: Record<string, unknown>;
}

export interface Scheduler {
  id: "at" | "daemon";
  schedule(job: ScheduledJob): Promise<void>;
  list(): Promise<ScheduledJob[]>;
  cancel(jobId: string): Promise<boolean>;
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}

export { AtScheduler, createAtScheduler } from "./at.js";
export { jobsFilePath, loadJobs, saveJobs } from "./store.js";
