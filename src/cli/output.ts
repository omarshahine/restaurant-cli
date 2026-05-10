/**
 * Shared output emitter. Every command's terminal display goes through this
 * so JSON / CSV / compact / select / human-friendly switches are consistent
 * (not re-implemented per command).
 *
 * Inspired by table-reservation-goat's --agent flag (one flag = JSON +
 * compact + no-color + no-input + yes) — see the comparison in WORKLOG.
 */

import { UsageError } from "../core/errors.js";

export interface AgentArgs {
  /** Marshal to JSON instead of human-readable text. */
  json?: boolean;
  /** Marshal to CSV (table-shaped results only). */
  csv?: boolean;
  /** Output only key fields (id, name, status, time, date). */
  compact?: boolean;
  /** Field projection: comma-separated list of dotted paths. */
  select?: string;
  /** No ANSI colors in human output. (We don't emit colors currently, but commands honor this.) */
  noColor?: boolean;
  /** No interactive prompts — fail closed instead of asking. */
  noInput?: boolean;
  /**
   * Rolled-up flag: equivalent to --json --compact --no-color --no-input --yes.
   * When set, individual flags above are coerced on (but --select still passes
   * through verbatim if provided).
   */
  agent?: boolean;
  /** Skip y/N confirmations on destructive commands. Implied by --agent. */
  yes?: boolean;
  /** Build the request, print the envelope, never fire. */
  dryRun?: boolean;
}

/**
 * Flag specs to spread into every `defineCommand` args block. Keeps the
 * --agent / --json / --csv / --compact / --select / --no-input / --no-color /
 * --yes / --dry-run flag set identical across commands.
 *
 * Citty's typing isn't strict about additional flags, so we keep this as a
 * loose Record — commands extend it with `...AGENT_ARGS, venue: {...}`.
 */
export const AGENT_ARGS = {
  agent: {
    type: "boolean",
    description:
      "All agent-friendly defaults: --json --compact --no-color --no-input --yes",
    default: false,
  },
  json: {
    type: "boolean",
    description: "Output JSON",
    default: false,
  },
  csv: {
    type: "boolean",
    description: "Output CSV (table-shaped results)",
    default: false,
  },
  compact: {
    type: "boolean",
    description: "Return only key fields (id, name, status, time, date)",
    default: false,
  },
  select: {
    type: "string",
    description:
      "Comma-separated dotted field paths to project from JSON output (e.g. id,name,time)",
    default: "",
  },
  "no-color": {
    type: "boolean",
    description: "Disable ANSI colors in human output",
    default: false,
  },
  "no-input": {
    type: "boolean",
    description: "Fail closed instead of prompting for input",
    default: false,
  },
  yes: {
    type: "boolean",
    description: "Skip confirmation prompts on destructive commands",
    default: false,
  },
  "dry-run": {
    type: "boolean",
    description: "Build the request and print the envelope without firing",
    default: false,
  },
} as const;

/**
 * Normalize the raw citty args object (kebab-case keys, all-strings-or-bools)
 * into an `AgentArgs` view with --agent rollup applied.
 *
 * Floor env vars (always force on, override flags):
 *   - RESTAURANT_CLI_DRY_RUN=1
 *   - RESTAURANT_CLI_AGENT=1
 */
export function parseAgentArgs(raw: Record<string, unknown>): AgentArgs {
  const envAgent = process.env["RESTAURANT_CLI_AGENT"] === "1";
  const envDryRun = process.env["RESTAURANT_CLI_DRY_RUN"] === "1";
  const agent = Boolean(raw["agent"]) || envAgent;

  const out: AgentArgs = {
    json: Boolean(raw["json"]) || agent,
    csv: Boolean(raw["csv"]),
    compact: Boolean(raw["compact"]) || agent,
    select: typeof raw["select"] === "string" ? (raw["select"] as string) : "",
    noColor: Boolean(raw["no-color"]) || agent,
    noInput: Boolean(raw["no-input"]) || agent,
    agent,
    yes: Boolean(raw["yes"]) || agent,
    dryRun: Boolean(raw["dry-run"]) || envDryRun,
  };

  if (out.json && out.csv) {
    throw new UsageError("--json and --csv are mutually exclusive");
  }
  return out;
}

/** Fields a `--compact` view keeps (when present on the result rows). */
const COMPACT_FIELDS = new Set([
  "id",
  "name",
  "venueName",
  "venueId",
  "status",
  "time",
  "date",
  "partySize",
  "token",
  "type",
  "provider",
  "ok",
  "error",
  "reservationId",
  "confirmationMessage",
]);

/**
 * Reduce an object to the COMPACT_FIELDS allowlist. Recurses into arrays.
 * Non-objects pass through untouched.
 *
 * `topLevel=true` (the default callsite) suppresses compaction on a single
 * object — the assumption is that a single object is an envelope (book
 * result, version metadata, dry-run preview) whose fields are inherently
 * "what the caller asked for". Arrays of rows get full row-by-row compaction.
 */
export function compactProject<T>(value: T, topLevel = true): T {
  if (Array.isArray(value)) {
    return value.map((v) => compactProject(v, false)) as unknown as T;
  }
  if (topLevel) return value;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (COMPACT_FIELDS.has(k)) out[k] = v;
    }
    return out as T;
  }
  return value;
}

/**
 * Apply a `--select id,name,time` projection. Supports dotted paths.
 *
 * Operates on object or array-of-object inputs. Scalars and `null` pass through.
 * Unknown paths emit `undefined` (matching jq's behavior) which gets dropped
 * during JSON.stringify, so missing paths don't pollute output.
 */
export function selectProject<T>(value: T, paths: string[]): unknown {
  if (paths.length === 0) return value;
  const pick = (obj: unknown): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const path of paths) {
      const parts = path.split(".");
      let cur: unknown = obj;
      for (const p of parts) {
        if (cur == null || typeof cur !== "object") {
          cur = undefined;
          break;
        }
        cur = (cur as Record<string, unknown>)[p];
      }
      out[path] = cur;
    }
    return out;
  };
  if (Array.isArray(value)) {
    return value.map((v) => pick(v));
  }
  if (value && typeof value === "object") {
    return pick(value);
  }
  return value;
}

function parseSelect(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Find the dotted-path on each row (used by CSV header inference). */
function flattenPaths(value: unknown, prefix = "", acc: string[] = []): string[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        flattenPaths(v, next, acc);
      } else {
        acc.push(next);
      }
    }
  }
  return acc;
}

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const p of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Render `data` as CSV. Headers inferred from the first row's flattened
 * dotted-path keys (object rows) or `value` (scalar rows). Always emits a
 * header row.
 */
export function toCsv(data: unknown): string {
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) return "";
  const first = rows[0];
  const isObj = first && typeof first === "object" && !Array.isArray(first);
  const headers = isObj ? flattenPaths(first) : ["value"];
  const lines = [headers.join(",")];
  for (const r of rows) {
    if (isObj) {
      lines.push(headers.map((h) => csvEscape(getPath(r, h))).join(","));
    } else {
      lines.push(csvEscape(r));
    }
  }
  return lines.join("\n");
}

export interface EmitOptions<T> {
  /** Human-friendly renderer. Called only when JSON/CSV are off. */
  human?: (value: T) => string | string[] | void;
  /**
   * Optional message printed instead of the renderer when the result is
   * empty (zero rows in an array). Defaults to "No results.".
   */
  empty?: string;
}

/**
 * Emit a result to stdout. Selects the right marshaller from AgentArgs:
 *
 *   --json   → JSON.stringify(2-space)  (after --select / --compact)
 *   --csv    → CSV with inferred headers (after --select / --compact)
 *   default  → calls opts.human(value); each returned string is one line.
 */
export function emit<T>(value: T, args: AgentArgs, opts: EmitOptions<T> = {}): void {
  const paths = parseSelect(args.select);

  let projected: unknown = value;
  if (args.compact) projected = compactProject(projected);
  if (paths.length > 0) projected = selectProject(projected, paths);

  if (args.json) {
    process.stdout.write(JSON.stringify(projected, null, 2) + "\n");
    return;
  }
  if (args.csv) {
    process.stdout.write(toCsv(projected) + "\n");
    return;
  }

  // Human path. If the projected value is an empty array, print the empty hint.
  if (Array.isArray(projected) && projected.length === 0) {
    process.stdout.write((opts.empty ?? "No results.") + "\n");
    return;
  }

  const rendered = opts.human ? opts.human(value) : undefined;
  if (rendered === undefined) return;
  const lines = Array.isArray(rendered) ? rendered : [rendered];
  for (const line of lines) {
    process.stdout.write(line + "\n");
  }
}

/**
 * Emit a structured error envelope. Always goes to stderr. JSON shape
 * matches the result envelope so agents can branch on `ok`.
 */
export function emitError(
  message: string,
  args: AgentArgs,
  opts: { code?: string; exitCode?: number; extra?: Record<string, unknown> } = {},
): void {
  if (opts.exitCode !== undefined) process.exitCode = opts.exitCode;
  if (args.json) {
    const envelope = {
      ok: false,
      error: message,
      ...(opts.code ? { code: opts.code } : {}),
      ...(opts.extra ?? {}),
    };
    process.stderr.write(JSON.stringify(envelope, null, 2) + "\n");
    return;
  }
  process.stderr.write(message + "\n");
}
