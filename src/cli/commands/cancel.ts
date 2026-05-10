import { defineCommand } from "citty";
import { buildRegistry } from "../../providers/bootstrap.js";
import { loadConfig } from "../../core/config.js";
import { CapabilityError } from "../../core/errors.js";
import { credentialsFor } from "../credentials.js";
import { confirmTTY } from "../prompts.js";
import { AGENT_ARGS, emit, emitError, parseAgentArgs } from "../output.js";

export const cancelCommand = defineCommand({
  meta: {
    name: "cancel",
    description: "Cancel a reservation by id",
  },
  args: {
    id: { type: "positional", description: "Reservation id (resy_token)", required: true },
    provider: { type: "string", description: "Provider id", default: "" },
    ...AGENT_ARGS,
  },
  async run({ args }) {
    const agentArgs = parseAgentArgs(args as unknown as Record<string, unknown>);
    const config = loadConfig();
    const registry = buildRegistry();
    const providerId = args.provider || config.defaults.provider;
    const provider = registry.get(providerId);
    if (!provider.capabilities.cancel) {
      throw new CapabilityError(provider.id, "cancel");
    }

    const creds = credentialsFor(providerId, config, provider);

    if (agentArgs.dryRun) {
      const envelope = {
        ok: true,
        dryRun: true,
        provider: providerId,
        request: { reservationId: args.id },
      };
      emit(envelope, agentArgs, {
        human: () => `DRY RUN — would cancel ${providerId} reservation ${args.id}`,
      });
      return;
    }

    if (!agentArgs.yes) {
      const ok = await confirmTTY(`Cancel ${providerId} reservation ${args.id}?`, {
        noInput: agentArgs.noInput,
      });
      if (!ok) {
        process.stdout.write("Aborted. Reservation not cancelled.\n");
        return;
      }
    }

    const result = await provider.cancel(args.id, creds);

    if (!result.ok) {
      emitError(`Cancel failed: ${result.error ?? "unknown error"}`, agentArgs, {
        code: "provider",
        exitCode: 5,
      });
      return;
    }
    emit(result, agentArgs, {
      human: () => `Cancelled reservation ${args.id}.`,
    });
  },
});
