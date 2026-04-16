import { defineCommand } from "citty";

export const versionCommand = defineCommand({
  meta: { name: "version", description: "Print the CLI version" },
  run() {
    // eslint-disable-next-line no-console
    console.log("restaurant-cli 0.1.0");
  },
});
