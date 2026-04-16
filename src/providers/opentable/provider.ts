import type { AuthStatus, BookRequest, BookResult, Credentials, Provider, Reservation } from "../types.js";
import { CapabilityError } from "../../core/errors.js";
// Parsers in ./search.ts and ./availability.ts are kept for future
// reuse by a browser-automation read-path. They are not wired into the
// live provider surface today because their HTTP transport is blocked.
import { buildBookingUrl } from "./deeplink.js";

/**
 * OpenTable provider.
 *
 * OpenTable has no public consumer API, and live probing (2026-04-16)
 * confirmed that the `/dapi/` endpoints used by opentable.com's React app
 * are protected by Akamai Bot Manager with TLS-fingerprint blocking. Pure
 * Node.js `fetch()` gets a 403 regardless of how closely we mimic Chrome
 * headers. The HTTP parser code in `client.ts`, `search.ts`, and
 * `availability.ts` is kept as scaffolding for a future browser-automation
 * module (which will feed real data through the same parsers) but those
 * capabilities are declared `false` here because they don't currently work.
 *
 * The one capability that DOES work today is `bookUrl` — a pure URL
 * construction that opens opentable.com's booking page pre-filled with the
 * venue, date, time, and party size. The user completes the reservation in
 * their own browser with their own OpenTable account.
 *
 * Safety invariant from mikehe123/opentable-reservations: never auto-submit
 * a booking. Hand-off only.
 */
export const openTableProvider: Provider = {
  id: "opentable",
  displayName: "OpenTable",
  capabilities: {
    // HTTP-based search/availability blocked by Akamai. Will flip to true
    // when a browser-automation read-path lands.
    search: false,
    availability: false,
    book: false,
    cancel: false,
    list: false,
    snipe: false,
    bookUrl: true,
  },
  auth: {
    async validate(_creds: Credentials): Promise<AuthStatus> {
      return {
        ok: true,
        detail: "bookUrl only (live HTTP blocked by Akamai; browser module TBD)",
      };
    },
    setupPrompts: () => [],
  },
  async searchVenues(_q, _creds) {
    throw new CapabilityError(
      "opentable",
      "search (HTTP blocked by Akamai; use --provider resy or the future browser module)",
    );
  },
  async getAvailability(_q, _creds) {
    throw new CapabilityError(
      "opentable",
      "availability (HTTP blocked by Akamai; use --provider resy or the future browser module)",
    );
  },
  async book(_r: BookRequest, _creds: Credentials): Promise<BookResult> {
    throw new CapabilityError("opentable", "book (use getBookingUrl for hand-off)");
  },
  async cancel(): Promise<never> {
    throw new CapabilityError("opentable", "cancel (browser automation milestone)");
  },
  async listReservations(): Promise<Reservation[]> {
    throw new CapabilityError("opentable", "list (requires logged-in session)");
  },
  async getBookingUrl(r: BookRequest): Promise<string> {
    return buildBookingUrl({
      restaurantId: r.venueId,
      date: r.date,
      time: r.time,
      partySize: r.partySize,
    });
  },
};
