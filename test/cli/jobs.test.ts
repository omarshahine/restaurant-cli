import { describe, it, expect } from "vitest";
import { jobsCommand } from "../../src/cli/commands/jobs.js";

describe("cli/commands/jobs", () => {
  it("parent command has NO default run handler (citty pre-hook regression guard)", () => {
    // Citty dispatches the parent's `run` as a pre-hook whenever a
    // subcommand fires. Adding a default `run` to `jobsCommand` would cause
    // every `restaurant jobs list|cancel|logs` call to double-print. This
    // test locks in the "no default run" contract so that regression is
    // caught at CI time, not in user-facing output.
    expect((jobsCommand as unknown as { run?: unknown }).run).toBeUndefined();
  });

  it("exposes list / cancel / logs subcommands", () => {
    const sub = (jobsCommand as unknown as { subCommands?: Record<string, unknown> }).subCommands;
    expect(sub).toBeDefined();
    expect(Object.keys(sub!).sort()).toEqual(["cancel", "list", "logs"]);
  });
});
