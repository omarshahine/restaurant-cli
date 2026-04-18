import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAtScheduler, localTimestamp } from "../../src/scheduler/at.js";

describe("scheduler/at", () => {
  let tmp: string;
  const origState = process.env.XDG_STATE_HOME;

  // We stub the POSIX `at` invocation so the tests don't write to the real
  // at-queue. The stub increments a counter and returns a deterministic
  // "at job id" for every enqueue.
  let nextAtJobId = 0;
  const enqueueStub = async () => String(++nextAtJobId);
  let cancelledAtJobs: string[] = [];
  const cancelAtStub = async (id: string) => {
    cancelledAtJobs.push(id);
  };

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "restaurant-cli-test-"));
    process.env.XDG_STATE_HOME = tmp;
    nextAtJobId = 0;
    cancelledAtJobs = [];
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    if (origState === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = origState;
  });

  it("schedules and lists jobs via metadata store (and records atJobId)", async () => {
    const sched = createAtScheduler({ enqueue: enqueueStub, cancelAt: cancelAtStub });
    await sched.schedule({
      id: "job-1",
      command: "restaurant book --venue 1 --party 2 --date 2026-05-01 --time 19:00",
      runAt: new Date("2026-04-30T14:00:00Z"),
      providerId: "resy",
    });
    const listed = await sched.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe("job-1");
    // The scheduler should have enriched the persisted row with the at-job id
    // so `restaurant jobs cancel` can call `atrm` without asking `atq`.
    expect(listed[0]!.metadata?.atJobId).toBe("1");
  });

  it("rejects duplicate job ids", async () => {
    const sched = createAtScheduler({ enqueue: enqueueStub, cancelAt: cancelAtStub });
    const job = {
      id: "dup",
      command: "noop",
      runAt: new Date(),
      providerId: "resy",
    };
    await sched.schedule(job);
    await expect(sched.schedule(job)).rejects.toThrow(/already scheduled/);
  });

  it("cancel() removes persisted job AND calls atrm with the at-job id", async () => {
    const sched = createAtScheduler({ enqueue: enqueueStub, cancelAt: cancelAtStub });
    await sched.schedule({
      id: "to-cancel",
      command: "noop",
      runAt: new Date(),
      providerId: "resy",
    });
    expect(await sched.cancel("to-cancel")).toBe(true);
    expect(await sched.list()).toHaveLength(0);
    expect(cancelledAtJobs).toEqual(["1"]);
    expect(await sched.cancel("to-cancel")).toBe(false);
  });

  it("cancel() survives an atrm failure so the local row never leaks", async () => {
    const flaky = async () => {
      throw new Error("Cannot find job 99");
    };
    const sched = createAtScheduler({ enqueue: enqueueStub, cancelAt: flaky });
    await sched.schedule({
      id: "orphan",
      command: "noop",
      runAt: new Date(),
      providerId: "resy",
    });
    expect(await sched.cancel("orphan")).toBe(true);
    expect(await sched.list()).toHaveLength(0);
  });

  it("localTimestamp formats as YYYYMMDDHHMM in local time", () => {
    // Constructed from wall-clock parts so the test is tz-stable:
    // new Date(2026, 3, 30, 14, 5) == Apr 30 2026 14:05 in whichever tz
    // the test runner is in. localTimestamp must reflect those same parts.
    const d = new Date(2026, 3, 30, 14, 5);
    expect(localTimestamp(d)).toBe("202604301405");
  });
});
