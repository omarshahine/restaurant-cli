import type { ProviderRegistry } from "../registry.js";
import { tockProvider } from "./provider.js";

export function register(registry: ProviderRegistry): void {
  registry.register(tockProvider);
}

export { tockProvider };
