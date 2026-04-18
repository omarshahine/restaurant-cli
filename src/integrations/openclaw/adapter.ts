/**
 * OpenClaw SDK adapter. This is the module OpenClaw actually loads —
 * a top-level-await wrapper that hands the plugin-entry factory to the SDK.
 *
 * Kept separate from `index.ts` so the library can be imported without the
 * `openclaw` peerDep present (`openclaw` is optional). If the SDK isn't
 * installed at runtime, we log a clear warning and default-export `null`
 * rather than a cryptic "Cannot find module".
 */

import { createOpenClawEntry } from "./index.js";

let pluginEntry: unknown = null;

try {
  // Dynamic import so bundlers don't try to resolve the optional peer dep
  // at build time.
  const sdk = (await import("openclaw/plugin-sdk/plugin-entry" as string)) as {
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
