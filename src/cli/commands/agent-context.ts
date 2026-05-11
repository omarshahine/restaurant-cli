/**
 * Self-describing CLI manifest. Inspired by table-reservation-goat's
 * `agent-context` — an agent runs this once and learns the entire surface
 * (commands, subcommands, args, providers, capabilities) in one JSON call.
 *
 * Walks the citty command tree starting from the root and emits a structured
 * description with provider capabilities + global flag set.
 */

import { defineCommand } from "citty";
import type { ArgsDef, CommandDef } from "citty";
import { AGENT_ARGS, emit, parseAgentArgs } from "../output.js";
import { buildRegistry } from "../../providers/bootstrap.js";
import { VERSION } from "../../core/version.js";

interface FlagSpec {
  name: string;
  type: string;
  description?: string;
  default?: string;
  required?: boolean;
}

interface CommandSpec {
  name: string;
  description?: string;
  flags: FlagSpec[];
  positional: FlagSpec[];
  subcommands: CommandSpec[];
  /**
   * Annotations: agent-relevant metadata. Read-only commands are safe for
   * autorun; commands with destructive=true require explicit confirmation
   * unless --yes/--agent is set.
   */
  annotations: {
    readOnly: boolean;
    destructive: boolean;
  };
}

interface ProviderSpec {
  id: string;
  displayName: string;
  capabilities: Record<string, boolean>;
}

interface ManifestSpec {
  schemaVersion: 1;
  cli: { name: "restaurant-cli"; version: string };
  globalFlags: FlagSpec[];
  exitCodes: Record<string, { value: number; meaning: string }>;
  commands: CommandSpec[];
  providers: ProviderSpec[];
  envFloors: { name: string; effect: string }[];
}

const READ_ONLY = new Set([
  "search",
  "availability",
  "lookup",
  "list",
  "doctor",
  "version",
  "config",
  "jobs",
  "agent-context",
  "earliest",
  "status", // auth status — pure read
]);
const DESTRUCTIVE = new Set([
  "book",
  "cancel",
  "snipe",
  "login", // auth login — writes ~/.secrets.env
  "setup", // setup — writes credentials
]);

function isReadOnly(name: string): boolean {
  return READ_ONLY.has(name);
}

function isDestructive(name: string): boolean {
  return DESTRUCTIVE.has(name);
}

function describeArgs(args: ArgsDef | undefined): { flags: FlagSpec[]; positional: FlagSpec[] } {
  const flags: FlagSpec[] = [];
  const positional: FlagSpec[] = [];
  if (!args) return { flags, positional };
  for (const [name, def] of Object.entries(args)) {
    const d = def as {
      type?: string;
      description?: string;
      default?: unknown;
      required?: boolean;
    };
    const spec: FlagSpec = {
      name,
      type: d.type ?? "string",
      ...(d.description ? { description: d.description } : {}),
      ...(d.default !== undefined ? { default: String(d.default) } : {}),
      ...(d.required ? { required: true } : {}),
    };
    if (d.type === "positional") {
      positional.push(spec);
    } else {
      flags.push(spec);
    }
  }
  return { flags, positional };
}

function describeCommand(name: string, def: CommandDef): CommandSpec {
  const meta = (def as { meta?: { description?: string } }).meta ?? {};
  const args = (def as { args?: ArgsDef }).args;
  const subs = (def as { subCommands?: Record<string, CommandDef> }).subCommands ?? {};
  const { flags, positional } = describeArgs(args);
  return {
    name,
    ...(meta.description ? { description: meta.description } : {}),
    flags,
    positional,
    subcommands: Object.entries(subs).map(([n, d]) => describeCommand(n, d)),
    annotations: {
      readOnly: isReadOnly(name),
      destructive: isDestructive(name),
    },
  };
}

/**
 * Build the agent-context manifest. `commandTree` is the root subCommands
 * map from src/cli/index.ts — passed in to avoid a circular import.
 */
export function buildManifest(commandTree: Record<string, CommandDef>): ManifestSpec {
  const registry = buildRegistry();
  return {
    schemaVersion: 1,
    cli: { name: "restaurant-cli", version: VERSION },
    globalFlags: Object.entries(AGENT_ARGS).map(([name, def]) => {
      const d = def as { type: string; description?: string; default?: unknown };
      return {
        name,
        type: d.type,
        ...(d.description ? { description: d.description } : {}),
        ...(d.default !== undefined ? { default: String(d.default) } : {}),
      };
    }),
    exitCodes: {
      success: { value: 0, meaning: "ok" },
      usage: { value: 2, meaning: "bad flags or missing required arg" },
      not_found: { value: 3, meaning: "venue, reservation, or slot not found" },
      api: { value: 5, meaning: "provider api error or capability miss" },
      auth: { value: 6, meaning: "missing or invalid credentials" },
      rate_limited: { value: 7, meaning: "provider rate limit (429)" },
      config: { value: 10, meaning: "config file invalid or unreadable" },
    },
    commands: Object.entries(commandTree).map(([n, d]) => describeCommand(n, d)),
    providers: registry.list().map((p) => ({
      id: p.id,
      displayName: p.displayName,
      capabilities: p.capabilities as unknown as Record<string, boolean>,
    })),
    envFloors: [
      {
        name: "RESTAURANT_CLI_DRY_RUN",
        effect: "When =1, every destructive command runs as --dry-run regardless of flags",
      },
      {
        name: "RESTAURANT_CLI_AGENT",
        effect: "When =1, every command behaves as if --agent were passed",
      },
      {
        name: "RESTAURANT_CLI_OT_MODE",
        effect: "OpenTable transport: api|browser|auto (default auto)",
      },
      {
        name: "RESTAURANT_CLI_TRG_BIN",
        effect: "Override path to the table-reservation-goat-pp-cli binary (defaults to ~/go/bin/...)",
      },
      {
        name: "RESTAURANT_CLI_TOCK_ALLOW_BOOK",
        effect: "Required (=1) to actually fire a Tock book — default-off safety floor",
      },
    ],
  };
}

export const agentContextCommand = defineCommand({
  meta: {
    name: "agent-context",
    description:
      "Emit a structured JSON manifest describing every command, flag, provider, and exit code (for agents)",
  },
  args: { ...AGENT_ARGS },
  async run({ args }) {
    const agentArgs = parseAgentArgs(args as unknown as Record<string, unknown>);
    // Lazy import to dodge a circular reference at module-load time.
    const { commandTree } = await import("./_tree.js");
    const manifest = buildManifest(commandTree);
    // Force JSON for human callers too — the whole point of this command is
    // structured output. CSV is meaningless here.
    if (!agentArgs.json && !agentArgs.csv) agentArgs.json = true;
    emit(manifest, agentArgs);
  },
});
