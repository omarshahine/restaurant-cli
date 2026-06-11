import { defineCommand } from "citty";
import { configPath, loadConfig } from "../../core/config.js";
import { AGENT_ARGS, emit, parseAgentArgs } from "../output.js";

// Keys whose values may carry secret material. Matched case-insensitively
// against the leaf key name. `tokenRef` is intentionally NOT here — it is a
// SecretRef pointer (no value), safe to show.
const SECRET_KEY_RE = /(token|secret|password|cookie|apikey|api_key|auth)/i;

/**
 * Recursively mask values under secret-looking keys so `restaurant config`
 * never spills a token/cookie into the terminal or logs. SecretRef objects
 * (which hold only a pointer) are preserved.
 */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "tokenRef") {
        out[k] = v; // pointer, not a value
      } else if (SECRET_KEY_RE.test(k) && typeof v === "string") {
        out[k] = "***redacted***";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

export const configCommand = defineCommand({
  meta: { name: "config", description: "Inspect the restaurant-cli config file" },
  args: {
    action: {
      type: "positional",
      description: "get | path",
      required: false,
      default: "get",
    },
    "show-secrets": {
      type: "boolean",
      description: "Print secret values in full instead of masking them",
      default: false,
    },
    ...AGENT_ARGS,
  },
  run({ args }) {
    const agentArgs = parseAgentArgs(args as unknown as Record<string, unknown>);
    const p = configPath();
    if (args.action === "path") {
      emit({ path: p }, agentArgs, { human: () => p });
      return;
    }
    const raw = loadConfig();
    const config = args["show-secrets"] ? raw : redact(raw);
    emit({ path: p, config }, agentArgs, {
      human: () => [`# ${p}`, JSON.stringify(config, null, 2)],
    });
  },
});
