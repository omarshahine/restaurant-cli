/**
 * OpenClaw SDK adapter. This is the module OpenClaw actually loads —
 * a sync wrapper that hands the plugin-entry factory to the SDK.
 *
 * Kept separate from `index.ts` so the library can be imported without the
 * `openclaw` peerDep present (`openclaw` is optional). If the SDK isn't
 * installed at runtime, we log a clear warning and default-export `null`
 * rather than a cryptic "Cannot find module".
 *
 * Uses `createRequire` (sync) rather than dynamic `import()` with top-level
 * await, because the OpenClaw plugin loader evaluates the module in a
 * non-async wrapper and rejects TLA ("ReferenceError: await is not defined").
 */

import { createRequire } from "node:module";
import { createOpenClawEntry } from "./index.js";

let pluginEntry: unknown = null;

const require = createRequire(import.meta.url);

try {
  const sdk = require("openclaw/plugin-sdk/plugin-entry") as {
    definePluginEntry?: (e: unknown) => unknown;
  };
  if (typeof sdk.definePluginEntry !== "function") {
    throw new Error(
      "OpenClaw SDK loaded but did not export `definePluginEntry`. Upgrade the `openclaw` package.",
    );
  }
  pluginEntry = sdk.definePluginEntry(createOpenClawEntry());
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn(
    "[restaurant-cli] OpenClaw SDK not available; plugin entry unresolved. " +
      `Install the peer dep with \`npm i openclaw\`. Cause: ${(e as Error).message}`,
  );
}

export default pluginEntry;
