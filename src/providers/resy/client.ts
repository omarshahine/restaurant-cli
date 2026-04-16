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
  async searchVenues(params: { query: string; city?: string; limit?: number }): Promise<unknown> {
    const body = {
      query: params.query,
      per_page: params.limit ?? 20,
      // `location` is a cluster slug like "ny", "la"; omitted if not provided
      ...(params.city ? { location: params.city } : {}),
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
   * M2 entry point; stubbed for now.
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
   * Two-step book: fetch booking details via config-id, then confirm.
   * see resy-cli: internal/resy/book.go
   *
   * M2 entry point; stubbed for now.
   */
  async book(params: { configId: string; day: string; partySize: number }): Promise<unknown> {
    const qs = new URLSearchParams({
      config_id: params.configId,
      day: params.day,
      party_size: String(params.partySize),
    });
    return this.request("POST", `/3/details?${qs.toString()}`, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "",
    });
  }

  /**
   * Cancel a reservation.
   * see resy-cli: internal/resy/cancel.go
   *
   * M2 entry point; stubbed for now.
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
