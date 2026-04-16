export class RestaurantCliError extends Error {
  constructor(message: string, public readonly code: string, public readonly exitCode: number = 1) {
    super(message);
    this.name = "RestaurantCliError";
  }
}

export class ConfigError extends RestaurantCliError {
  constructor(message: string) {
    super(message, "config", 2);
    this.name = "ConfigError";
  }
}

export class AuthError extends RestaurantCliError {
  constructor(message: string) {
    super(message, "auth", 3);
    this.name = "AuthError";
  }
}

export class ProviderError extends RestaurantCliError {
  constructor(message: string, public readonly provider: string) {
    super(message, "provider", 4);
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
