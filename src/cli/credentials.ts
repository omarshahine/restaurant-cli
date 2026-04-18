import { loadConfig } from "../core/config.js";
import { resolveSecret } from "../core/secrets.js";
import { AuthError } from "../core/errors.js";
import type { Credentials, Provider } from "../providers/types.js";

/**
 * Resolve the Credentials object for a given provider from config.yaml +
 * ~/.secrets.env. Used by every CLI subcommand that needs to call into a
 * Provider method.
 *
 * If the provider has no setupPrompts (anonymous — e.g. OpenTable), missing
 * config is fine: we return {}. If the provider has setupPrompts but no
 * config, we throw AuthError directing the user to run `restaurant setup`.
 */
export function credentialsFor(
  providerId: string,
  config: ReturnType<typeof loadConfig>,
  provider: Pick<Provider, "auth">,
): Credentials {
  const pc = config.providers[providerId];
  const needsConfig = provider.auth.setupPrompts().length > 0;
  if (!pc && needsConfig) {
    throw new AuthError(
      `No config for provider "${providerId}". Run: restaurant setup ${providerId}`,
    );
  }

  const creds: Credentials = {};
  for (const [k, v] of Object.entries(pc ?? {})) {
    if (k === "tokenRef" || k === "token") continue;
    if (typeof v === "string") creds[k] = v;
  }
  const tokenRef = pc?.tokenRef;
  const token = pc?.token;
  const resolved = resolveSecret(tokenRef) ?? resolveSecret(token) ?? undefined;
  if (resolved) creds["authToken"] = resolved;
  return creds;
}
