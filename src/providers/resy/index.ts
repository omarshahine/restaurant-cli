import type { ProviderRegistry } from "../registry.js";
import { resyProvider } from "./provider.js";

export function register(registry: ProviderRegistry): void {
  registry.register(resyProvider);
}

export { resyProvider };
