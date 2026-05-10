import { defineCommand } from "citty";
import { configPath, loadConfig } from "../../core/config.js";
import { AGENT_ARGS, emit, parseAgentArgs } from "../output.js";

export const configCommand = defineCommand({
  meta: { name: "config", description: "Inspect the restaurant-cli config file" },
  args: {
    action: {
      type: "positional",
      description: "get | path",
      required: false,
      default: "get",
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
    const config = loadConfig();
    emit({ path: p, config }, agentArgs, {
      human: () => [`# ${p}`, JSON.stringify(config, null, 2)],
    });
  },
});
