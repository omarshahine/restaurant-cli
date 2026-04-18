import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

/**
 * Ask a yes/no question on the TTY. Returns true only on "y" or "yes"
 * (case-insensitive). Pressing Enter without typing is "no" — safer default
 * for destructive actions (book, cancel).
 */
export async function confirmTTY(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question(`${message} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
