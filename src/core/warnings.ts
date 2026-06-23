/**
 * User-facing security disclosures, printed to stderr so they never pollute
 * `--json` stdout. These exist to make the tool's credential and automation
 * behavior explicit *before* it happens, rather than silently — the
 * trade-offs are deliberate (see README "Config & credential storage"), but
 * the user should be told.
 */

import { secretsFilePath } from "./secrets.js";

/**
 * Hand a freshly-obtained credential back to the user to store in their own
 * environment. The tool does NOT persist it to disk — it keeps only an
 * environment `SecretRef` in config, and reads the value from the environment
 * at runtime. Printed to stderr (never stdout, so `--json` stays clean), with
 * the value shown once so the user can place it in their secret manager.
 */
export function instructEnvSecret(
  envVar: string,
  value: string,
  note?: string,
): void {
  const quoted = `'${value.replace(/'/g, `'\\''`)}'`;
  const lines = [
    "",
    "🔑 Credential ready — this tool does NOT write it to disk. Add it to your",
    "   environment so the CLI and scheduled jobs can read it (shown once):",
    "",
    `       export ${envVar}=${quoted}`,
    "",
    `   Put that line in your shell's secret file (e.g. ${secretsFilePath()}, or a`,
    "   chezmoi/age-encrypted source), then `source` it and run `restaurant doctor`",
    "   to verify. Note: whatever file you choose holds a bearer credential in",
    "   plaintext — keep it 0600 and out of backups/syncs you don't control.",
  ];
  if (note) lines.push(`   ${note}`);
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
 * Reset the once-per-process guards. Test-only — lets each test start from a
 * clean slate instead of depending on call order across the file.
 */
export function resetWarningStateForTests(): void {
  browserWarningShown.clear();
}

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
