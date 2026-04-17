import type { AuthStatus, BookRequest, BookResult, Credentials, Provider, Reservation } from "../types.js";
import { CapabilityError } from "../../core/errors.js";
import { searchVenues } from "./search.js";
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
    // Browser-driven search live as of 2026-04-17. Availability still TODO
    // (requires different interaction flow than searchbox autocomplete).
    search: true,
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
        detail: "anonymous (browser-driven search via patchright)",
      };
    },
    setupPrompts: () => [],
  },
  searchVenues,
  async getAvailability(_q, _creds) {
    throw new CapabilityError(
      "opentable",
      "availability (browser-driven flow not yet wired; use bookUrl for known venues)",
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
