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

// The `openclaw` package is an optional peerDependency, so TypeScript can't
// resolve its subpath at compile time. The dynamic specifier is stored in a
// variable to stop bundlers from trying to follow it, and the result is
// typed by hand below.
const OPENCLAW_SDK_MODULE = "openclaw/plugin-sdk/plugin-entry";

try {
  // Storing the specifier in a variable means TypeScript can't statically
  // check the module path. That's exactly what we want for an optional
  // peer dep — at compile time we're fine without it installed, and at
  // runtime the catch below handles "Cannot find module".
  const sdk = (await import(OPENCLAW_SDK_MODULE)) as {
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
