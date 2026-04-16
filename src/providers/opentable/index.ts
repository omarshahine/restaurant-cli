import type { ProviderRegistry } from "../registry.js";
import { openTableProvider } from "./provider.js";

export function register(registry: ProviderRegistry): void {
  registry.register(openTableProvider);
}

export { openTableProvider };
