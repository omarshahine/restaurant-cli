import { defineCommand } from "citty";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import password from "@inquirer/password";
import { buildRegistry } from "../../providers/bootstrap.js";
import {
  loadConfig,
  saveConfig,
  upsertProvider,
  configPath,
} from "../../core/config.js";
import { secretsFilePath } from "../../core/secrets.js";
import type { Credentials, SetupPrompt } from "../../providers/types.js";
import {
  mirrorCredentialsToOpenClaw,
  OPENCLAW_PLUGIN_ID,
} from "../../integrations/openclaw/install.js";
import { instructEnvSecret } from "../../core/warnings.js";

const KNOWN_TARGETS = ["openclaw"] as const;
type SetupTarget = (typeof KNOWN_TARGETS)[number];

function parseProviderArg(arg: string): {
  providerId: string;
  target: SetupTarget | null;
} {
  for (const t of KNOWN_TARGETS) {
    const suffix = `-${t}`;
    if (arg.endsWith(suffix)) {
      return { providerId: arg.slice(0, -suffix.length), target: t };
    }
  }
  return { providerId: arg, target: null };
}

export const setupCommand = defineCommand({
  meta: {
    name: "setup",
    description: "Interactively configure credentials for a provider",
  },
  args: {
    provider: {
      type: "positional",
      description:
        "Provider id (e.g. resy). Append `-openclaw` (e.g. resy-openclaw) to also mirror credentials into the OpenClaw plugin config.",
      required: true,
    },
  },
  async run({ args }) {
    const { providerId, target } = parseProviderArg(args.provider);
    const registry = buildRegistry();
    const provider = registry.get(providerId);
    const rl = createInterface({ input, output });
    let rlClosed = false;
    try {
      // eslint-disable-next-line no-console
      console.log(`Setting up ${provider.displayName} (${provider.id})`);
      const prompts = provider.auth.setupPrompts();
      const answers: Credentials = {};

      for (const p of prompts) {
        const help = p.help ? `\n  (${p.help})` : "";
        const label = `${p.label}${help}`;
        const answer = p.sensitive
          ? await password({ message: label, mask: "*" })
          : (await rl.question(`${label}: `)).trim();
        if (!answer) continue;
        answers[p.id] = answer;
      }

      // Close readline before any further prompts so stdin is free.
      rl.close();
      rlClosed = true;

      let finalCreds: Credentials = answers;

      if (provider.auth.login) {
        try {
          // eslint-disable-next-line no-console
          console.log("Logging in …");
          finalCreds = await provider.auth.login(answers);
          // eslint-disable-next-line no-console
          console.log(
            `Login OK${finalCreds["firstName"] ? ` — hi ${finalCreds["firstName"]}` : ""}`,
          );
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`Login failed: ${(e as Error).message}`);
          process.exit(1);
          return;
        }
      }

      await persist(provider.id, finalCreds, prompts);

      if (target === "openclaw") {
        mirrorToOpenClaw(provider.id, finalCreds);
      }
    } finally {
      if (!rlClosed) rl.close();
    }
  },
});

function mirrorToOpenClaw(providerId: string, creds: Credentials): void {
  const result = mirrorCredentialsToOpenClaw(providerId, creds);
  // eslint-disable-next-line no-console
  const log = console.log;
  // eslint-disable-next-line no-console
  const warn = console.warn;
  switch (result.status) {
    case "not-installed":
      warn(
        `\n⚠  OpenClaw config not found at ${result.configPath} — skipping plugin mirror. ` +
          `Install OpenClaw first, then re-run 'restaurant setup ${providerId}-openclaw'.`,
      );
      return;
    case "plugin-not-registered":
      warn(
        `\n⚠  OpenClaw plugin '${OPENCLAW_PLUGIN_ID}' not in plugins.allow. ` +
          `Run 'openclaw plugins install --link <repo-path>' first, then re-run this command.`,
      );
      return;
    case "ok":
      if (result.updated.length === 0 && result.removed.length === 0) {
        log(
          `\n✓ OpenClaw plugin config already up-to-date (${result.configPath}).`,
        );
        return;
      }
      if (result.updated.length > 0) {
        log(
          `\n✓ Mirrored ${result.updated.length} value(s) into ${result.configPath}:`,
        );
        for (const k of result.updated)
          log(`  - plugins.entries.${OPENCLAW_PLUGIN_ID}.config.${k}`);
      }
      if (result.removed.length > 0) {
        log(
          `\n✓ Pruned ${result.removed.length} stale key(s) from ${result.configPath}:`,
        );
        for (const k of result.removed)
          log(`  - plugins.entries.${OPENCLAW_PLUGIN_ID}.config.${k}`);
      }
      log(`\nRestart the OpenClaw gateway to pick up the change.`);
      return;
  }
}

/**
 * Persist final creds (env-first — the token is NEVER written to disk):
 *   - fields NOT marked `sensitive` (email, firstName, and provider-public
 *     identifiers like Resy's shared client id) → config.yaml
 *   - the main bearer token (`authToken`) → config holds only a
 *     `{source:"env", id:"<PROVIDER>_AUTH_TOKEN"}` `tokenRef`; the value is
 *     handed to the user (via `instructEnvSecret`) to place in their own env.
 *
 * Classification is default-deny: anything a provider declares `sensitive`
 * (or `ephemeral`) — plus `authToken`/`password` — is kept out of the
 * plaintext config.yaml. An unrecognized sensitive field is skipped with a
 * warning rather than silently written to plaintext.
 */
async function persist(
  providerId: string,
  creds: Credentials,
  prompts: SetupPrompt[] = [],
): Promise<void> {
  const config = loadConfig();
  const patch: Record<string, unknown> = {};

  // Keys that must never land in plaintext config.yaml.
  const secretKeys = new Set<string>(["authToken", "password"]);
  for (const p of prompts) {
    if (p.sensitive || p.ephemeral) secretKeys.add(p.id);
  }

  for (const [k, v] of Object.entries(creds)) {
    if (secretKeys.has(k)) continue;
    if (typeof v === "string" && v) patch[k] = v;
  }

  // Surface any sensitive field we deliberately did NOT persist (other than
  // the bearer token, handled below, and the ephemeral password) so it never
  // silently disappears into nowhere or into plaintext config.
  for (const [k, v] of Object.entries(creds)) {
    if (!secretKeys.has(k) || k === "authToken" || k === "password") continue;
    if (typeof v === "string" && v) {
      // eslint-disable-next-line no-console
      console.warn(
        `  ⚠  '${k}' is marked sensitive and was NOT written to config.yaml. ` +
          `Store it in ${secretsFilePath()} manually if the provider needs it.`,
      );
    }
  }

  // env-first: never persist the token to disk. Config stores only an env
  // SecretRef; the value is handed to the user to place in their own
  // environment (see instructEnvSecret below).
  let envSecret: { envVar: string; value: string } | undefined;
  if (creds["authToken"]) {
    const envVar = `${providerId.toUpperCase()}_AUTH_TOKEN`;
    patch["tokenRef"] = { source: "env", id: envVar };
    envSecret = { envVar, value: creds["authToken"] };
  }

  const updated = upsertProvider(config, providerId, patch);
  saveConfig(updated);
  // eslint-disable-next-line no-console
  console.log(`\nSaved ${providerId} config to ${configPath()}`);
  if (envSecret) {
    instructEnvSecret(envSecret.envVar, envSecret.value);
  }
}
