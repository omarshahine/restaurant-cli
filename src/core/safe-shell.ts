/**
 * Shell wrapper.
 *
 * Centralizes child_process invocations behind a small, auditable surface:
 *   - spawnProcess: re-exports the spawn API from child_process. Kept as
 *     a direct re-export so the stdio-narrowing overloads survive (e.g.
 *     stdio ["pipe", "pipe", "pipe"] yields a ChildProcessByStdio with
 *     non-null streams).
 *   - runCli(cli, argv, opts): invokes a binary with an argv array. No
 *     shell, no string interpolation — args cannot inject shell
 *     metacharacters.
 *   - whichBinary(name): cross-platform PATH lookup (`which` on POSIX,
 *     `where.exe` on Windows).
 *
 * The rest of the codebase imports only these wrappers; no other module
 * touches child_process directly. Concentrating shell-outs in one file
 * makes them easy to audit.
 */

import {
	spawn as _spawn,
	execFile as _runFile,
	execFileSync as _runFileSync,
} from "node:child_process";
import { promisify } from "node:util";

const _runFileAsync = promisify(_runFile);

/** Re-export of the child_process spawn entry — kept in this module to centralize the audit surface. */
export const spawnProcess: typeof _spawn = _spawn;

export interface RunOptions {
	timeout?: number;
	maxBuffer?: number;
	env?: NodeJS.ProcessEnv;
}

/** Run a binary with arguments and return stdout/stderr. */
export async function runCli(
	cli: string,
	args: string[],
	opts: RunOptions = {},
): Promise<{ stdout: string; stderr: string }> {
	const { stdout, stderr } = await _runFileAsync(cli, args, {
		encoding: "utf8",
		timeout: opts.timeout ?? 30_000,
		maxBuffer: opts.maxBuffer ?? 4 * 1024 * 1024,
		...(opts.env ? { env: opts.env } : {}),
	});
	return { stdout, stderr };
}

/** Cross-platform binary lookup using `which` / `where.exe`. */
export function whichBinary(name: string): string | null {
	const cmd = process.platform === "win32" ? "where.exe" : "which";
	try {
		const result = _runFileSync(cmd, [name], { encoding: "utf8" }).trim();
		const first = result.split("\n")[0]?.trim();
		return first || null;
	} catch {
		return null;
	}
}
