/**
 * Tock book — DEFAULT-OFF.
 *
 * Tock's checkout uses an in-page Braintree CSRF flow bound to the user's
 * logged-in browser session. There's no clean fetch-only path; live booking
 * requires driving a real Chrome instance (patchright). That's not yet
 * implemented — and even when it lands, two safety floors gate it:
 *
 *   1. `RESTAURANT_CLI_TOCK_ALLOW_BOOK=1` env var (per-machine opt-in)
 *   2. `--yes` flag or `--agent` mode for non-interactive callers
 *
 * Until the browser path lands, this function returns `{ ok: false }` with a
 * typed error code so the CLI surfaces the situation honestly instead of
 * pretending to succeed. The capability flag stays `book: false` on the
 * provider, which means `restaurant book --provider tock` errors out at
 * the CapabilityError check before ever reaching here.
 *
 * That redundancy (gate at the provider AND gate here) is intentional — if
 * a future commit flips the capability to true, the function still bails
 * unless the env var is set.
 */

import type { BookRequest, BookResult, Credentials } from "../types.js";
import { isTockBookAllowed } from "./env.js";

export async function book(_r: BookRequest, _creds: Credentials): Promise<BookResult> {
  if (!isTockBookAllowed()) {
    return {
      ok: false,
      error:
        "tock_book_disabled: set RESTAURANT_CLI_TOCK_ALLOW_BOOK=1 to enable. " +
        "Browser-driven Tock book is not yet implemented (planned).",
    };
  }
  return {
    ok: false,
    error:
      "tock_book_unimplemented: live Tock book requires the patchright browser path, " +
      "which has not landed yet. Track progress in CHANGELOG.",
  };
}
