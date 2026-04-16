import { defineCommand } from "citty";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { buildRegistry } from "../../providers/bootstrap.js";
import { loadConfig, saveConfig, upsertProvider, configPath } from "../../core/config.js";
import {
  appendSecret,
  secretKeyPresent,
  secretsFilePath,
} from "../../core/secrets.js";

export const setupCommand = defineCommand({
  meta: {
    name: "setup",
    description: "Interactively configure credentials for a provider",
  },
  args: {
    provider: {
      type: "positional",
      description: "Provider id (e.g. resy)",
      required: true,
    },
  },
  async run({ args }) {
    const registry = buildRegistry();
    const provider = registry.get(args.provider);
    const rl = createInterface({ input, output });
    try {
      // eslint-disable-next-line no-console
      console.log(`Setting up ${provider.displayName} (${provider.id})`);
      const prompts = provider.auth.setupPrompts();
      const config = loadConfig();
      const nonSensitive: Record<string, string> = {};

      for (const p of prompts) {
        const answer = (await rl.question(`${p.label}${p.help ? `\n  (${p.help})` : ""}: `)).trim();
        if (!answer) continue;

        if (p.sensitive && p.envVar) {
          if (secretKeyPresent(p.envVar)) {
            // eslint-disable-next-line no-console
            console.log(
              `  ${p.envVar} is already defined in ${secretsFilePath()}; leaving it alone. Edit manually if you want to rotate.`,
            );
          } else {
            appendSecret(p.envVar, answer);
            // eslint-disable-next-line no-console
            console.log(`  wrote ${p.envVar} to ${secretsFilePath()} (restart shell to load)`);
          }
          nonSensitive[`${p.id}Ref`] = ""; // noop; tokenRef below
        } else {
          nonSensitive[p.id] = answer;
        }
      }

      // Wire a tokenRef pointing at the first sensitive envVar so consumers
      // (CLI, OpenClaw) read from env instead of inline plaintext.
      const sensitive = prompts.find((p) => p.sensitive && p.envVar);
      const patch: Record<string, unknown> = { ...nonSensitive };
      if (sensitive?.envVar) {
        patch["tokenRef"] = { source: "env", id: sensitive.envVar };
      }

      const updated = upsertProvider(config, provider.id, patch);
      saveConfig(updated);
      // eslint-disable-next-line no-console
      console.log(`\nSaved ${provider.displayName} config to ${configPath()}`);
      // eslint-disable-next-line no-console
      console.log(`Run 'restaurant doctor' to verify.`);
    } finally {
      rl.close();
    }
  },
});
