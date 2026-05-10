import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { UsageError } from "../core/errors.js";

/**
 * Ask a yes/no question on the TTY. Returns true only on "y" or "yes"
 * (case-insensitive). Pressing Enter without typing is "no" — safer default
 * for destructive actions (book, cancel).
 *
 * When `noInput` is true (agent mode or --no-input), throws UsageError instead
 * of prompting — agents can't answer TTY questions. Callers should arrange
 * for --yes to be set in that case so they never reach this code path.
 */
export async function confirmTTY(
  message: string,
  opts: { noInput?: boolean } = {},
): Promise<boolean> {
  if (opts.noInput) {
    throw new UsageError(
      `Cannot prompt in non-interactive mode. Add --yes to confirm "${message}".`,
    );
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question(`${message} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
