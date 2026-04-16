import type { AuthStatus, BookRequest, BookResult, Credentials, Provider, Reservation } from "../types.js";
import { CapabilityError } from "../../core/errors.js";
import { searchVenues } from "./search.js";
import { getAvailability } from "./availability.js";
import { buildBookingUrl } from "./deeplink.js";

/**
 * OpenTable provider.
 *
 * OpenTable has no public consumer API. We use the reverse-engineered
 * `/dapi/` endpoints (same ones opentable.com's own React app uses) for
 * search and availability. Booking cannot be completed programmatically
 * without driving a real browser — that's deferred to a future milestone
 * behind an opt-in flag. For now we expose `bookUrl` capability and return a
 * pre-filled deep link the user can click to complete the booking in their
 * own browser with their own OpenTable account.
 */
export const openTableProvider: Provider = {
  id: "opentable",
  displayName: "OpenTable",
  capabilities: {
    search: true,
    availability: true,
    book: false,
    cancel: false,
    list: false,
    snipe: false, // enable once book: true (browser automation module)
    bookUrl: true,
  },
  auth: {
    async validate(_creds: Credentials): Promise<AuthStatus> {
      // OpenTable /dapi/ search works anonymously. No credentials needed
      // for the read-path; declare OK. When the browser-backed book-path
      // lands, this will probe the logged-in session instead.
      return { ok: true, detail: "anonymous (read-only)" };
    },
    setupPrompts: () => [],
  },
  searchVenues,
  getAvailability,
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
