import type { Provider, ProviderId } from "./types.js";

/**
 * Runtime dispatcher. Core code asks the registry for a provider by id; it
 * never imports provider modules directly. This is what makes the project
 * pluggable: `bootstrap.ts` is the only file that needs to change when a new
 * provider is added.
 */
export interface ProviderRegistry {
  register(p: Provider): void;
  get(id: ProviderId): Provider;
  tryGet(id: ProviderId): Provider | undefined;
  has(id: ProviderId): boolean;
  list(): Provider[];
  ids(): ProviderId[];
}

class InMemoryRegistry implements ProviderRegistry {
  private readonly providers = new Map<ProviderId, Provider>();

  register(p: Provider): void {
    if (this.providers.has(p.id)) {
      throw new Error(`Provider "${p.id}" is already registered`);
    }
    this.providers.set(p.id, p);
  }

  get(id: ProviderId): Provider {
    const p = this.providers.get(id);
    if (!p) {
      const known = this.ids().join(", ") || "(none)";
      throw new Error(`Unknown provider: "${id}". Registered: ${known}`);
    }
    return p;
  }

  tryGet(id: ProviderId): Provider | undefined {
    return this.providers.get(id);
  }

  has(id: ProviderId): boolean {
    return this.providers.has(id);
  }

  list(): Provider[] {
    return [...this.providers.values()];
  }

  ids(): ProviderId[] {
    return [...this.providers.keys()];
  }
}

export function createRegistry(): ProviderRegistry {
  return new InMemoryRegistry();
}
