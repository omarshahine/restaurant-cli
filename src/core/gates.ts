/**
 * Opt-in gates for higher-risk capabilities.
 *
 * Some features are powerful enough that they should not run unless the user
 * has explicitly accepted the trade-off: scheduled *unattended* booking (loads
 * a token and books later with no further confirmation) and *live-site
 * automation* for providers with no official API (scraping / anti-bot bypass,
 * which may violate a site's Terms of Service).
 *
 * These are OFF by default and fail closed with an actionable message. Set the
 * named env var to `"1"` to enable. Centralizing the contract here keeps every
 * gated path consistent and easy to audit.
 */

import { UsageError } from "./errors.js";

export const SNIPE_ENV = "RESTAURANT_CLI_ENABLE_SNIPE";
export const SITE_AUTOMATION_ENV = "RESTAURANT_CLI_ENABLE_SITE_AUTOMATION";

/** True when an opt-in env var is explicitly enabled (`"1"`). */
export function isOptInEnabled(envVar: string): boolean {
  return process.env[envVar] === "1";
}

/** Throw a clear, actionable UsageError unless `envVar` is enabled. */
export function requireOptIn(envVar: string, what: string, why: string): void {
  if (isOptInEnabled(envVar)) return;
  throw new UsageError(
    `${what} is off by default. ${why} ` +
      `Set ${envVar}=1 in your environment to enable it (you accept the risk).`,
  );
}

/** Gate scheduled (unattended) booking. */
export function requireSnipeEnabled(): void {
  requireOptIn(
    SNIPE_ENV,
    "Scheduled sniping",
    "It queues an UNATTENDED booking that fires later — loading your provider token at run time and booking with no further confirmation.",
  );
}

/**
 * Gate live-site automation for a provider that has no official API. `what`
 * names the specific operation (e.g. "OpenTable search").
 */
export function requireSiteAutomationEnabled(what: string): void {
  requireOptIn(
    SITE_AUTOMATION_ENV,
    what,
    "It automates a live site that has no official public API (scraping / anti-bot bypass), which may be against the site's Terms of Service.",
  );
}
