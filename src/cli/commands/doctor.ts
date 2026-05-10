import { defineCommand } from "citty";
import { buildRegistry } from "../../providers/bootstrap.js";
import { configPath, loadConfig } from "../../core/config.js";
import { resolveSecret, secretsFilePath } from "../../core/secrets.js";
import { createAtScheduler } from "../../scheduler/at.js";
import type { Credentials } from "../../providers/types.js";
import { AGENT_ARGS, emit, parseAgentArgs } from "../output.js";
import { UsageError } from "../../core/errors.js";
import { VERSION } from "../../core/version.js";

interface ProviderHealth {
  id: string;
  capabilities: string[];
  authStatus: "ok" | "warn" | "error" | "skip";
  authDetail?: string;
  authError?: string;
}

interface DoctorReport {
  cli: { name: "restaurant-cli"; version: string };
  node: string;
  paths: { config: string; secrets: string };
  defaults: { provider: string };
  providers: ProviderHealth[];
  scheduler: { backend: "at"; ok: boolean; detail?: string };
  /** Overall health bucket: ok / stale / error. */
  health: "ok" | "stale" | "error";
}

export const doctorCommand = defineCommand({
  meta: {
    name: "doctor",
    description: "Check config, credentials, and backend health",
  },
  args: {
    "fail-on": {
      type: "string",
      description: "Exit non-zero when health level is reached: never|stale|error (default: never)",
      default: "never",
    },
    ...AGENT_ARGS,
  },
  async run({ args }) {
    const agentArgs = parseAgentArgs(args as unknown as Record<string, unknown>);
    const failOn = String(args["fail-on"] ?? "never");
    if (!["never", "stale", "error"].includes(failOn)) {
      throw new UsageError(`--fail-on must be one of: never, stale, error`);
    }

    const registry = buildRegistry();
    const config = loadConfig();

    const providers: ProviderHealth[] = [];
    let anyError = false;
    let anyStale = false;

    for (const p of registry.list()) {
      const caps = Object.entries(p.capabilities)
        .filter(([, v]) => v === true)
        .map(([k]) => k);
      const pc = config.providers[p.id];
      const needsConfig = p.auth.setupPrompts().length > 0;
      if (!pc && needsConfig) {
        providers.push({
          id: p.id,
          capabilities: caps,
          authStatus: "skip",
          authDetail: `not configured (run: restaurant setup ${p.id})`,
        });
        anyStale = true;
        continue;
      }
      const creds = buildCreds(pc ?? {});
      try {
        const status = await p.auth.validate(creds);
        if (status.ok) {
          providers.push({
            id: p.id,
            capabilities: caps,
            authStatus: "ok",
            ...(status.detail ? { authDetail: status.detail } : {}),
          });
        } else {
          providers.push({
            id: p.id,
            capabilities: caps,
            authStatus: "error",
            ...(status.detail ? { authDetail: status.detail } : {}),
            ...(status.error ? { authError: status.error } : {}),
          });
          anyError = true;
        }
      } catch (e) {
        providers.push({
          id: p.id,
          capabilities: caps,
          authStatus: "error",
          authError: (e as Error).message,
        });
        anyError = true;
      }
    }

    const sched = createAtScheduler();
    const health = await sched.healthCheck();
    if (!health.ok) anyError = true;

    const overall: DoctorReport["health"] = anyError ? "error" : anyStale ? "stale" : "ok";

    const report: DoctorReport = {
      cli: { name: "restaurant-cli", version: VERSION },
      node: process.version,
      paths: { config: configPath(), secrets: secretsFilePath() },
      defaults: { provider: config.defaults.provider },
      providers,
      scheduler: { backend: "at", ok: health.ok, ...(health.detail ? { detail: health.detail } : {}) },
      health: overall,
    };

    emit(report, agentArgs, {
      human: () => {
        const lines = [
          `restaurant-cli ${VERSION}`,
          `node ${process.version}`,
          `config:  ${report.paths.config}`,
          `secrets: ${report.paths.secrets}`,
          `default provider: ${report.defaults.provider}`,
          "",
          `providers registered: ${providers.map((p) => p.id).join(", ") || "(none)"}`,
        ];
        for (const ph of providers) {
          lines.push(`  - ${ph.id}  capabilities: ${ph.capabilities.join(", ") || "(none)"}`);
          if (ph.authStatus === "skip") {
            lines.push(`      auth: not configured (${ph.authDetail ?? ""})`);
          } else if (ph.authStatus === "ok") {
            lines.push(`      auth: ok${ph.authDetail ? ` (${ph.authDetail})` : ""}`);
          } else {
            lines.push(`      auth: FAIL${ph.authError ? ` — ${ph.authError}` : ""}`);
          }
        }
        lines.push("");
        lines.push(
          `scheduler (at): ${health.ok ? "ok" : "FAIL"}${health.detail ? ` — ${health.detail}` : ""}`,
        );
        lines.push("");
        lines.push(`overall health: ${overall}`);
        return lines;
      },
    });

    if (failOn === "error" && overall === "error") {
      process.exitCode = 5;
    } else if (failOn === "stale" && (overall === "stale" || overall === "error")) {
      process.exitCode = 5;
    }
  },
});

function buildCreds(pc: Record<string, unknown>): Credentials {
  const creds: Credentials = {};
  for (const [k, v] of Object.entries(pc)) {
    if (k === "tokenRef" || k === "token") continue;
    if (typeof v === "string") creds[k] = v;
  }
  const token = resolveSecret(pc["tokenRef"] as never) ?? resolveSecret(pc["token"] as never);
  if (token) creds["authToken"] = token;
  return creds;
}
