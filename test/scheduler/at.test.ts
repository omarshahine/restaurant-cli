import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAtScheduler } from "../../src/scheduler/at.js";

describe("scheduler/at", () => {
  let tmp: string;
  const origState = process.env.XDG_STATE_HOME;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "restaurant-cli-test-"));
    process.env.XDG_STATE_HOME = tmp;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    if (origState === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = origState;
  });

  it("schedules and lists jobs via metadata store", async () => {
    const sched = createAtScheduler();
    await sched.schedule({
      id: "job-1",
      command: "restaurant book --venue 1 --party 2 --date 2026-05-01 --time 19:00",
      runAt: new Date("2026-04-30T14:00:00Z"),
      providerId: "resy",
    });
    const listed = await sched.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe("job-1");
  });

  it("rejects duplicate job ids", async () => {
    const sched = createAtScheduler();
    const job = {
      id: "dup",
      command: "noop",
      runAt: new Date(),
      providerId: "resy",
    };
    await sched.schedule(job);
    await expect(sched.schedule(job)).rejects.toThrow(/already scheduled/);
  });

  it("cancels and removes persisted jobs", async () => {
    const sched = createAtScheduler();
    await sched.schedule({
      id: "to-cancel",
      command: "noop",
      runAt: new Date(),
      providerId: "resy",
    });
    expect(await sched.cancel("to-cancel")).toBe(true);
    expect(await sched.list()).toHaveLength(0);
    expect(await sched.cancel("to-cancel")).toBe(false);
  });
});
