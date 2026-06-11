/**
 * Shell-out wrapper around the `table-reservation-goat-pp-cli` Go binary
 * (https://github.com/mvanhorn/printing-press-library, Apache-2.0).
 *
 * Tock anonymous reads need two things our Node stack can't provide
 * cleanly: a Chrome TLS fingerprint to clear Cloudflare (Go's `enetx/surf`
 * impersonates Chrome at the TLS layer; Node has no first-class
 * equivalent that ships outside a 25MB native binary) AND a working
 * `x-tock-session` token that Tock's React bundle mints client-side. The
 * trg binary handles both. We exec it for search + availability.
 *
 * Trade-offs (documented honestly in CHANGELOG + README):
 *   ✓ Works today, no Cloudflare drama
 *   ✓ Reuses upstream's research + maintenance
 *   ✗ Requires Go binary installed (`npx -y @mvanhorn/printing-press install
 *     table-reservation-goat` + `~/go/bin` on PATH)
 *   ✗ ~500ms per call vs ~50ms for a native fetch
 *
 * Install path is auto-detected; override via `RESTAURANT_CLI_TRG_BIN`.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { warnBrowserAutomation } from "../../core/warnings.js";
import {
  NotFoundError,
  ProviderError,
} from "../../core/errors.js";

const DEFAULT_TIMEOUT_MS = 60_000;

export interface TrgAvailabilityResult {
  available: boolean;
  network: "tock" | "opentable";
  venue: string;
  url?: string;
  reason?: string;
  bookable_times?: string[]; // ISO local "YYYY-MM-DDTHH:MM"
  slot_at?: string;
}

export interface TrgRestaurant {
  id: string;
  name: string;
  slug: string;
  network: "tock" | "opentable";
  metro?: string;
  neighborhood?: string;
  cuisine?: string;
  latitude?: number;
  longitude?: number;
  url?: string;
  match_score?: number;
}

export interface TrgSearchEnvelope {
  queried_at: string;
  query: string;
  results: TrgRestaurant[];
  sources_queried: string[];
}

/**
 * Resolved path to the binary, or null when nothing is installed.
 *
 * `RESTAURANT_CLI_TRG_BIN` overrides auto-detection. When the override is
 * set but the file doesn't exist, we throw immediately — silently falling
 * back to "install missing" sends the user to a needless npx install when
 * the real cause is a typo or stale path.
 */
export function resolveTrgBinary(): string | null {
  const override = process.env["RESTAURANT_CLI_TRG_BIN"];
  if (override) {
    if (existsSync(override)) return override;
    throw new ProviderError(
      `RESTAURANT_CLI_TRG_BIN is set to "${override}" but no file exists there. ` +
        "Fix the path or unset the variable to use auto-detection.",
      "tock",
    );
  }
  const candidates = [
    join(homedir(), "go", "bin", "table-reservation-goat-pp-cli"),
    join(homedir(), ".local", "bin", "table-reservation-goat-pp-cli"),
    "/usr/local/bin/table-reservation-goat-pp-cli",
    "/opt/homebrew/bin/table-reservation-goat-pp-cli",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function missingBinaryError(): ProviderError {
  return new ProviderError(
    "Tock requires the `table-reservation-goat-pp-cli` binary. Install with:\n" +
      "  npx -y @mvanhorn/printing-press install table-reservation-goat\n" +
      "Then add Go's bin dir to PATH, or set RESTAURANT_CLI_TRG_BIN to the binary path.",
    "tock",
  );
}

/**
 * Spawn the binary with `args`, capture stdout, return parsed JSON. Stderr
 * is collected for the error path. Exits with code != 0 are wrapped in
 * ProviderError with the stderr tail; 3 = not_found-shaped responses
 * surface as NotFoundError.
 */
async function runTrg(args: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
  const bin = resolveTrgBinary();
  if (!bin) throw missingBinaryError();

  // Disclose (once) that Tock reads go through an external binary that
  // impersonates a browser's TLS fingerprint against the live site.
  warnBrowserAutomation("Tock");

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new ProviderError(`trg ${args.join(" ")}: timeout`, "tock"));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new ProviderError(`trg spawn error: ${e.message}`, "tock"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 3) {
        reject(
          new NotFoundError(
            `trg ${args[0] ?? ""} → not found${stderr ? `: ${stderr.trim()}` : ""}`,
          ),
        );
        return;
      }
      if (code !== 0) {
        reject(
          new ProviderError(
            `trg exited ${code}: ${stderr.trim() || stdout.slice(0, 300)}`,
            "tock",
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(
          new ProviderError(
            `trg returned non-JSON: ${(e as Error).message}; stdout starts: ${stdout.slice(0, 200)}`,
            "tock",
          ),
        );
      }
    });
  });
}

/**
 * `restaurants list --network tock --query <q>`. Returns the result envelope.
 * Used for venue search.
 */
export async function trgRestaurantsList(query: string, limit = 20): Promise<TrgSearchEnvelope> {
  const raw = await runTrg([
    "restaurants",
    "list",
    "--network",
    "tock",
    "--query",
    query,
    "--limit",
    String(limit),
    "--agent",
  ]);
  return raw as TrgSearchEnvelope;
}

/**
 * `availability check <slug> --date YYYY-MM-DD --party N`. Returns a single
 * envelope with `bookable_times` when slots exist.
 */
export async function trgAvailabilityCheck(
  slug: string,
  date: string,
  party: number,
): Promise<TrgAvailabilityResult> {
  const raw = await runTrg([
    "availability",
    "check",
    slug,
    "--date",
    date,
    "--party",
    String(party),
    "--agent",
  ]);
  return raw as TrgAvailabilityResult;
}

/**
 * `availability multi-day <slug> --days N --start-date YYYY-MM-DD --party P`.
 * Returns per-date envelopes. Used by the `earliest` cross-network command.
 */
export interface TrgMultiDayEnvelope {
  days: number;
  party: number;
  queried_at: string;
  results: { date: string; result: TrgAvailabilityResult }[];
}

export async function trgAvailabilityMultiDay(
  slug: string,
  startDate: string,
  days: number,
  party: number,
): Promise<TrgMultiDayEnvelope> {
  const raw = await runTrg([
    "availability",
    "multi-day",
    slug,
    "--days",
    String(days),
    "--start-date",
    startDate,
    "--party",
    String(party),
    "--agent",
  ]);
  return raw as TrgMultiDayEnvelope;
}
