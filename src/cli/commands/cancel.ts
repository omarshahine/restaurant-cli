import { defineCommand } from "citty";
import { buildRegistry } from "../../providers/bootstrap.js";
import { loadConfig } from "../../core/config.js";
import { CapabilityError } from "../../core/errors.js";
import { credentialsFor } from "../credentials.js";
import { confirmTTY } from "../prompts.js";

export const cancelCommand = defineCommand({
  meta: {
    name: "cancel",
    description: "Cancel a reservation by id",
  },
  args: {
    id: { type: "positional", description: "Reservation id (resy_token)", required: true },
    provider: { type: "string", description: "Provider id", default: "" },
    yes: { type: "boolean", description: "Skip confirmation prompt", default: false },
    json: { type: "boolean", description: "Output raw JSON result" },
  },
  async run({ args }) {
    const config = loadConfig();
    const registry = buildRegistry();
    const providerId = args.provider || config.defaults.provider;
    const provider = registry.get(providerId);
    if (!provider.capabilities.cancel) {
      throw new CapabilityError(provider.id, "cancel");
    }

    const creds = credentialsFor(providerId, config, provider);

    if (!args.yes) {
      const ok = await confirmTTY(`Cancel ${providerId} reservation ${args.id}?`);
      if (!ok) {
        // eslint-disable-next-line no-console
        console.log("Aborted. Reservation not cancelled.");
        return;
      }
    }

    const result = await provider.cancel(args.id, creds);

    if (args.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error(`Cancel failed: ${result.error ?? "unknown error"}`);
      process.exitCode = 4;
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`Cancelled reservation ${args.id}.`);
  },
});
