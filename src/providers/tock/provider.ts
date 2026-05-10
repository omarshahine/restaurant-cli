import type { Provider } from "../types.js";
import { tockSetupPrompts, validateTock } from "./auth.js";
import { searchVenues } from "./search.js";
import { getAvailability } from "./availability.js";
import { book } from "./book.js";
import { cancel } from "./cancel.js";
import { listReservations } from "./list.js";

/**
 * Tock provider — SCAFFOLDED, not yet wired for live data.
 *
 * Live probing (2026-05-10) verified that Cloudflare blocks every
 * `/api/*` call from undici/curl. Two paths can work; neither is built:
 *
 *   1. Imported session cookies via `restaurant auth login tock`. Read
 *      operations would succeed if the cookies are valid and the GraphQL
 *      operation names + variable shapes are correct. We don't have those
 *      yet (Tock's reservations release on the 15th of each month, so we
 *      couldn't capture the availability XHR during the probe).
 *
 *   2. Patchright browser fallback (`src/providers/tock/browser.ts`).
 *      Launch config verified; search/availability scrapers TODO.
 *
 * Until one of those lands, every Tock read errors out with a typed
 * "tock_*_unverified" message so callers (especially agents in --json
 * mode) see exactly why nothing came back. The capabilities below match
 * reality: only `bookUrl` is honest, and even that's not implemented yet.
 *
 * What DOES work today:
 *   - `restaurant auth login tock --from-file <chrome-cookies>` writes
 *     TOCK_SESSION_COOKIES to ~/.secrets.env; the client wires it into
 *     the Cookie header when present.
 *   - `restaurant auth status` shows which providers have cookies stored.
 *   - The scheduler allowlist (src/scheduler/at.ts) includes
 *     TOCK_SESSION_COOKIES + TOCK_CVC for the eventual snipe flow.
 */
export const tockProvider: Provider = {
  id: "tock",
  displayName: "Tock",
  capabilities: {
    // false: see "TODO" notes in client.ts — real operation names not yet
    // captured. The methods throw a typed error so callers know why.
    search: false,
    availability: false,
    book: false,
    // Requires session cookies + verified GraphQL op name. Not wired yet.
    cancel: false,
    list: false,
    snipe: false,
  },
  auth: {
    validate: validateTock,
    setupPrompts: tockSetupPrompts,
  },
  searchVenues,
  getAvailability,
  book,
  cancel,
  listReservations,
};
