import type { Provider } from "../types.js";
import { tockSetupPrompts, validateTock } from "./auth.js";
import { searchVenues } from "./search.js";
import { getAvailability } from "./availability.js";
import { book } from "./book.js";
import { cancel } from "./cancel.js";
import { listReservations } from "./list.js";

/**
 * Tock provider — shells out to `table-reservation-goat-pp-cli` (the trg
 * Go binary from mvanhorn/printing-press-library, Apache-2.0) for the two
 * operations that need a Chrome TLS fingerprint + Tock's page-issued
 * session token: search + availability.
 *
 * Why shell out instead of a native port: Tock anonymous reads require
 * (a) a Chrome TLS fingerprint to clear Cloudflare and (b) the
 * page-minted `x-tock-session` token that's not in any SSR-extractable
 * state. Go's `enetx/surf` handles (a); the trg binary's session-warmup
 * handles (b). Node lacks first-class equivalents that don't drag in
 * 25MB+ native binaries; reusing trg was the pragmatic call.
 *
 * Install path:
 *   npx -y @mvanhorn/printing-press install table-reservation-goat
 *   # adds ~/go/bin/table-reservation-goat-pp-cli
 *
 * Capabilities not yet wired (capability flags = false):
 *   - list / cancel — require imported session cookies + verified GraphQL.
 *     Cookie import lives at `restaurant auth login tock --from-file`.
 *   - book — Tock book is form-submit page navigation (NOT XHR), needs a
 *     chromedp-style pattern + CVC prompt. Trg itself defers this too.
 */
export const tockProvider: Provider = {
  id: "tock",
  displayName: "Tock",
  capabilities: {
    search: true,
    availability: true,
    book: false,
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
