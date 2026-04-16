#!/usr/bin/env node
import { runMain } from "../src/cli/index.js";

runMain().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
