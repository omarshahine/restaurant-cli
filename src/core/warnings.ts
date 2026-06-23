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
 * Reset the once-per-process guards. Test-only — lets each test start from a
 * clean slate instead of depending on call order across the file.
 */
export function resetWarningStateForTests(): void {
  credentialWarningShown = false;
  browserWarningShown.clear();
}

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
    "   (mode 0600). This is deliberate — the tool never uses the macOS Keychain",
    "   — so the same credential works across the CLI and scheduled jobs. As an",
    "   OpenClaw plugin it writes NO secret of its own: the plugin config holds",
    "   an environment SecretRef and the value is read from the gateway env.",
    "   Anyone who can read your home directory (local compromise, unencrypted",
    "   backups, shared machines) can read the plaintext file. Treat it as a",
    "   secret and rotate by editing it. The token is scoped to reservation",
    "   actions on your own account.",
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
      `   loads your provider token from ${secretsFilePath()} and runs \`book --yes\`,`,
      "   so it can complete a real reservation with no further confirmation. Cancel",
      "   a queued job with `restaurant jobs cancel <id>`.",
    ].join("\n") + "\n",
  );
}

/**
 * How a provider reaches a site that has no official API. Each mechanism gets
 * an accurate disclosure — they have different on-disk footprints.
 */
export type AutomationMechanism =
  | "browser-profile" // drives a real browser with a persistent Chrome profile (OpenTable)
  | "tls-binary"; // shells out to a binary that impersonates a browser's TLS (Tock)

const browserWarningShown = new Set<string>();

/**
 * Warn that a provider path automates a live site (no official public API),
 * which may be against the site's Terms of Service. The second line is tailored
 * to the actual mechanism so it never misrepresents what runs on the user's
 * machine. Printed once per site per process.
 */
export function warnBrowserAutomation(
  site: string,
  mechanism: AutomationMechanism,
): void {
  if (browserWarningShown.has(site)) return;
  browserWarningShown.add(site);
  const detail =
    mechanism === "browser-profile"
      ? "   It drives a real (stealth-patched) browser and keeps a persistent Chrome\n   profile in your home directory that retains cookies/session across runs."
      : "   It shells out to an external binary that impersonates a browser's TLS\n   fingerprint to reach the site; no browser window or profile is used.";
  process.stderr.write(
    [
      `⚠  Automation notice (${site}):`,
      "   There is no official public API, so this automates the live site and may",
      "   be against the site's Terms of Service — use at your own risk.",
      detail,
    ].join("\n") + "\n",
  );
}
