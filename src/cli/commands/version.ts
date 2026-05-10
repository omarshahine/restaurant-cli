import { defineCommand } from "citty";
import { AGENT_ARGS, emit, parseAgentArgs } from "../output.js";
import { VERSION } from "../../core/version.js";

export const versionCommand = defineCommand({
  meta: { name: "version", description: "Print the CLI version" },
  args: { ...AGENT_ARGS },
  run({ args }) {
    const agentArgs = parseAgentArgs(args as unknown as Record<string, unknown>);
    emit({ name: "restaurant-cli", version: VERSION }, agentArgs, {
      human: () => `restaurant-cli ${VERSION}`,
    });
  },
});
