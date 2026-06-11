/**
 * User-facing security disclosures, printed to stderr so they never pollute
 * `--json` stdout. These exist to make the tool's credential and automation
 * behavior explicit *before* it happens, rather than silently — the
 * trade-offs are deliberate (see README "Config & credential storage"), but
 * the user should be told.
 */

import { secretsFilePath } from "./secrets.js";

let credentialWarningShown = false;

/**
 * Warn that the action about to run stores a long-lived bearer credential in
 * plaintext on disk. Printed once per process. Call this BEFORE prompting for
 * or writing a token/cookie.
 */
export function warnPlaintextCredentialStorage(extra?: string): void {
  if (credentialWarningShown) return;
  credentialWarningShown = true;
  const lines = [
    "⚠  Credential storage notice:",
    `   This stores a long-lived bearer token/cookie in plaintext at ${secretsFilePath()}`,
    "   (and ~/.openclaw/secrets.json when used as an OpenClaw plugin). This is",
    "   deliberate — the tool never uses the macOS Keychain — so the same",
    "   credential works across the CLI, scheduled jobs, and the gateway.",
    "   Anyone who can read your home directory (local compromise, unencrypted",
    "   backups, shared machines) can read it. Treat those files as secrets and",
    "   rotate by editing them. The token is scoped to reservation actions on",
    "   your own account.",
  ];
  if (extra) lines.push(`   ${extra}`);
  process.stderr.write(lines.join("\n") + "\n");
}

/**
 * Warn that a scheduled snipe fires unattended: it loads provider tokens into
 * the job environment and books with `--yes` (no interactive confirmation) at
 * release time. Printed when queuing a snipe.
 */
export function warnUnattendedSnipe(): void {
  process.stderr.write(
    [
      "⚠  Unattended booking notice:",
      "   This scheduled job will run later WITHOUT asking again. At fire time it",
      "   loads your provider token from ~/.secrets.env and runs `book --yes`, so",
      "   it can complete a real reservation with no further confirmation. Cancel",
      "   a queued job with `restaurant jobs cancel <id>`.",
    ].join("\n") + "\n",
  );
}

const browserWarningShown = new Set<string>();

/**
 * Warn that a provider path drives a real browser against the live site
 * (anti-bot automation) using a persistent Chrome profile that accumulates
 * cookies/session in your home directory. Printed once per site per process.
 */
export function warnBrowserAutomation(site: string): void {
  if (browserWarningShown.has(site)) return;
  browserWarningShown.add(site);
  process.stderr.write(
    [
      `⚠  Browser automation notice (${site}):`,
      "   There is no official public API, so this drives a real browser against",
      "   the live site and may be against the site's Terms of Service — use at",
      "   your own risk. It keeps a persistent Chrome profile in your home",
      "   directory that retains cookies and session state across runs.",
    ].join("\n") + "\n",
  );
}
