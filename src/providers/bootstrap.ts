/**
 * The ONLY file that knows about every provider.
 *
 * Adding a new reservation platform: drop a module under `src/providers/<id>/`
 * that exports a `register(registry)` function, import it here, and call it.
 * Everything else in the codebase (CLI, integrations, tests) discovers the
 * new provider automatically through the registry.
 */

import { createRegistry, type ProviderRegistry } from "./registry.js";
import * as resy from "./resy/index.js";
import * as opentable from "./opentable/index.js";
import * as tock from "./tock/index.js";
// import * as sevenrooms from "./sevenrooms/index.js"; // later

export function registerAll(registry: ProviderRegistry): void {
  resy.register(registry);
  opentable.register(registry);
  tock.register(registry);
  // sevenrooms.register(registry);
}

/** Convenience: build a ready-to-use registry with every provider registered. */
export function buildRegistry(): ProviderRegistry {
  const registry = createRegistry();
  registerAll(registry);
  return registry;
}
