/**
 * Resy HTTP client.
 *
 * Clean TypeScript reimplementation; no code copied. Each method cites the
 * corresponding file in lgrees/resy-cli (MIT) for provenance.
 *
 * See: https://github.com/lgrees/resy-cli
 */

import { ProviderError } from "../../core/errors.js";
import type { ResyCredentials } from "./schemas.js";

const BASE_URL = "https://api.resy.com";
const DEFAULT_TIMEOUT_MS = 15000;

/** Build the headers Resy expects on authenticated requests. */
function buildHeaders(
  creds: ResyCredentials,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    Authorization: `ResyAPI api_key="${creds.apiKey}"`,
    "X-Resy-Auth-Token": creds.authToken,
    "X-Resy-Universal-Auth": creds.authToken,
    "User-Agent": "restaurant-cli/0.1.0 (+https://github.com/omarshahine/restaurant-cli)",
    Accept: "application/json, text/plain, */*",
    ...extra,
  };
}

export interface ResyClientOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class ResyClient {
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly creds: ResyCredentials,
    opts: ResyClientOptions = {},
  ) {
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /**
   * Venue search.
   * see resy-cli: internal/resy/search.go (public venue search endpoint)
   */
  async searchVenues(params: { query: string; limit?: number }): Promise<unknown> {
    const body = {
      query: params.query,
      per_page: params.limit ?? 20,
      types: ["venue"],
    };
    return this.request("POST", "/3/venuesearch/search", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  /**
   * Availability for a single venue / date / party size.
   * see resy-cli: internal/resy/find.go
   *
   * Live, read-only GET against `/4/find`. Returns the available slots Resy
   * publishes for the venue; does not mutate any reservation state.
   */
  async getAvailability(params: {
    venueId: string;
    date: string;
    partySize: number;
  }): Promise<unknown> {
    const qs = new URLSearchParams({
      lat: "0",
      long: "0",
      day: params.date,
      party_size: String(params.partySize),
      venue_id: params.venueId,
    });
    return this.request("GET", `/4/find?${qs.toString()}`);
  }

  /**
   * Step 1 of the two-step book flow: hand over the config_id from an
   * availability slot and get back a short-lived `book_token`.
   * see resy-cli: internal/resy/book.go
   *
   * LIVE API note (2026-04-18): Resy migrated this endpoint to JSON. Two
   * consequences vs the older form-encoded shape:
   *   - `Content-Type` must be `application/json` (415 otherwise)
   *   - params go in the JSON body; sending them as query-string args gets
   *     "invalid configuration ID" even with a valid token
   */
  async getBookingDetails(params: {
    configId: string;
    day: string;
    partySize: number;
  }): Promise<unknown> {
    return this.request("POST", `/3/details`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config_id: params.configId,
        day: params.day,
        party_size: params.partySize,
      }),
    });
  }

  /**
   * Step 2 of the two-step book flow: exchange the `book_token` + payment
   * method for a real reservation. This is the destructive call — it books
   * against the user's Resy account.
   * see resy-cli: internal/resy/book.go
   *
   * LIVE API note (2026-04-18): Unlike `/3/details` (which migrated to JSON),
   * `/3/book` is STILL form-encoded. Empirically verified by firing both
   * shapes — JSON returns "invalid book token", form-encoded succeeds.
   * `struct_payment_method` is sent as a form field whose value is a
   * JSON-stringified `{id}` object. Resy's own web client behaves this way.
   */
  async confirmBooking(params: {
    bookToken: string;
    paymentMethodId: number | string;
    sourceId?: string;
  }): Promise<unknown> {
    const body = new URLSearchParams({
      book_token: params.bookToken,
      struct_payment_method: JSON.stringify({ id: params.paymentMethodId }),
      source_id: params.sourceId ?? "resy.com-venue-details",
    }).toString();
    return this.request("POST", `/3/book`, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  }

  /**
   * Cancel a reservation.
   * see resy-cli: internal/resy/cancel.go
   *
   * LIVE, DESTRUCTIVE call — POSTs to `/3/cancel` with the reservation's
   * `resy_token` and irreversibly cancels the booking on the user's Resy
   * account. This is gated by the provider `cancel` capability flag and the
   * CLI's confirmation prompt; do not call it without an explicit user
   * decision to cancel.
   */
  async cancel(reservationId: string): Promise<unknown> {
    return this.request("POST", `/3/cancel`, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ resy_token: reservationId }).toString(),
    });
  }

  /**
   * List upcoming reservations.
   * see resy-cli: internal/resy/reservations.go
   */
  async listReservations(): Promise<unknown> {
    return this.request("GET", `/3/user/reservations`);
  }

  /** GET /auth/password is how resy-cli validates a token on setup. */
  async whoami(): Promise<unknown> {
    return this.request("GET", `/2/user`);
  }

  /**
   * Exchange email + password for a Resy auth token. Returns the full Resy
   * user object including `token`, which is the JWT used on subsequent calls
   * as `X-Resy-Auth-Token`.
   *
   * see resy-cli: internal/resy/login.go (same POST /3/auth/password shape)
   */
  async loginWithPassword(email: string, password: string): Promise<unknown> {
    return this.request("POST", "/3/auth/password", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email, password }).toString(),
    });
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    init: { headers?: Record<string, string>; body?: string } = {},
  ): Promise<unknown> {
    const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method,
        ...(init.body !== undefined ? { body: init.body } : {}),
        headers: buildHeaders(this.creds, init.headers ?? {}),
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new ProviderError(
          `Resy ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`,
          "resy",
        );
      }
      try {
        return text ? JSON.parse(text) : null;
      } catch {
        return text;
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
