/**
 * Tock book — NOT yet wired.
 *
 * Tock's checkout is form-submit page navigation (not XHR) — book is POST
 * `/<slug>/checkout/confirm-purchase` with `application/x-www-form-urlencoded`
 * body, follow redirect to `/<slug>/receipt?purchaseId=N`. The form body
 * shape was NOT captured by trg's research either; both we and upstream
 * mark book as v0.3 / "needs chromedp pattern".
 *
 * Default-off behind a two-floor safety gate:
 *   1. `capabilities.book = false` on the provider (blocks at the CLI layer)
 *   2. `RESTAURANT_CLI_TOCK_ALLOW_BOOK=1` env var (required to ever fire)
 *
 * Until the chromedp book path lands, this returns a typed error so agents
 * (especially in --json mode) see why nothing was booked.
 */

import type { BookRequest, BookResult, Credentials } from "../types.js";

function isTockBookAllowed(): boolean {
  return process.env["RESTAURANT_CLI_TOCK_ALLOW_BOOK"] === "1";
}

export async function book(_r: BookRequest, _creds: Credentials): Promise<BookResult> {
  if (!isTockBookAllowed()) {
    return {
      ok: false,
      error:
        "tock_book_disabled: set RESTAURANT_CLI_TOCK_ALLOW_BOOK=1 to enable. " +
        "Even then, the browser-driven book path is not yet implemented.",
    };
  }
  return {
    ok: false,
    error:
      "tock_book_unimplemented: live Tock book requires a chromedp-style " +
      "form-submit pattern + CVC prompt that has not landed yet.",
  };
}
