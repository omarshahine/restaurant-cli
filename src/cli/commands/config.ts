import { defineCommand } from "citty";
import { configPath, loadConfig } from "../../core/config.js";

export const configCommand = defineCommand({
  meta: { name: "config", description: "Inspect the restaurant-cli config file" },
  args: {
    action: {
      type: "positional",
      description: "get | path",
      required: false,
      default: "get",
    },
  },
  run({ args }) {
    const p = configPath();
    if (args.action === "path") {
      // eslint-disable-next-line no-console
      console.log(p);
      return;
    }
    const config = loadConfig();
    // eslint-disable-next-line no-console
    console.log(`# ${p}`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(config, null, 2));
  },
});
