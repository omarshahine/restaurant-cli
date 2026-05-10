/**
 * Exit code table — formalized for agent consumption. Documented in README.
 *
 *   0   success
 *   2   usage error (bad flags, missing required arg)
 *   3   not found (venue, reservation, slot, slug)
 *   4   provider runtime error (legacy; new code prefers 5)
 *   5   api error (provider returned 5xx, malformed response, capability miss)
 *   6   auth error (missing/invalid credentials)
 *   7   rate limited (HTTP 429)
 *   10  config error (bad/missing config file)
 *
 * Codes 4 and 6 are kept for backward compatibility — older callers may rely
 * on them — but new errors should pick from {2,3,5,7,10}. The `code` string
 * field is what the JSON envelope uses; the numeric `exitCode` is what the
 * process returns.
 */

export class RestaurantCliError extends Error {
  constructor(message: string, public readonly code: string, public readonly exitCode: number = 1) {
    super(message);
    this.name = "RestaurantCliError";
  }
}

export class ConfigError extends RestaurantCliError {
  constructor(message: string) {
    super(message, "config", 10);
    this.name = "ConfigError";
  }
}

export class AuthError extends RestaurantCliError {
  constructor(message: string) {
    super(message, "auth", 6);
    this.name = "AuthError";
  }
}

export class ProviderError extends RestaurantCliError {
  constructor(message: string, public readonly provider: string) {
    super(message, "provider", 5);
    this.name = "ProviderError";
  }
}

export class CapabilityError extends RestaurantCliError {
  constructor(provider: string, capability: string) {
    super(
      `Provider "${provider}" does not support "${capability}". ` +
        `Check \`restaurant doctor\` for supported features.`,
      "capability",
      5,
    );
    this.name = "CapabilityError";
  }
}

export class NotFoundError extends RestaurantCliError {
  constructor(message: string) {
    super(message, "not_found", 3);
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends RestaurantCliError {
  constructor(message: string, public readonly retryAfterSeconds?: number) {
    super(message, "rate_limited", 7);
    this.name = "RateLimitError";
  }
}

export class UsageError extends RestaurantCliError {
  constructor(message: string) {
    super(message, "usage", 2);
    this.name = "UsageError";
  }
}
