import { defineCommand } from "citty";
import { buildRegistry } from "../../providers/bootstrap.js";
import { configPath, loadConfig } from "../../core/config.js";
import { resolveSecret, secretsFilePath } from "../../core/secrets.js";
import { createAtScheduler } from "../../scheduler/at.js";
import type { Credentials } from "../../providers/types.js";

export const doctorCommand = defineCommand({
  meta: {
    name: "doctor",
    description: "Check config, credentials, and backend health",
  },
  async run() {
    const registry = buildRegistry();
    const config = loadConfig();
    // eslint-disable-next-line no-console
    const log = (s: string) => console.log(s);

    log(`restaurant-cli 0.1.0`);
    log(`node ${process.version}`);
    log(`config:  ${configPath()}`);
    log(`secrets: ${secretsFilePath()}`);
    log(`default provider: ${config.defaults.provider}`);
    log("");

    log(`providers registered: ${registry.ids().join(", ") || "(none)"}`);
    for (const p of registry.list()) {
      const caps = Object.entries(p.capabilities)
        .filter(([, v]) => v === true)
        .map(([k]) => k)
        .join(", ");
      log(`  - ${p.id}  capabilities: ${caps || "(none)"}`);

      const pc = config.providers[p.id];
      if (!pc) {
        log(`      auth: not configured (run: restaurant setup ${p.id})`);
        continue;
      }
      const creds = buildCreds(p.id, pc);
      try {
        const status = await p.auth.validate(creds);
        log(`      auth: ${status.ok ? "ok" : "FAIL"}${status.detail ? ` (${status.detail})` : ""}${status.error ? ` — ${status.error}` : ""}`);
      } catch (e) {
        log(`      auth: ERROR — ${(e as Error).message}`);
      }
    }

    log("");
    const sched = createAtScheduler();
    const health = await sched.healthCheck();
    log(`scheduler (at): ${health.ok ? "ok" : "FAIL"}${health.detail ? ` — ${health.detail}` : ""}`);
  },
});

function buildCreds(providerId: string, pc: Record<string, unknown>): Credentials {
  const creds: Credentials = {};
  for (const [k, v] of Object.entries(pc)) {
    if (k === "tokenRef" || k === "token") continue;
    if (typeof v === "string") creds[k] = v;
  }
  const token = resolveSecret(pc["tokenRef"] as never) ?? resolveSecret(pc["token"] as never);
  if (token) creds["authToken"] = token;
  if (providerId === "resy") {
    const apiKey = process.env["RESY_API_KEY"];
    if (apiKey) creds["apiKey"] = apiKey;
  }
  return creds;
}
