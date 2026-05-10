/**
 * Tock HTTP client.
 *
 * Tock has no public consumer API. Reverse-engineered endpoints:
 *
 *   - Anonymous reads (search, availability, restaurant detail):
 *     GET https://www.exploretock.com/api/consumer/v2/...
 *
 *   - Authenticated reads (list reservations, profile):
 *     same path, sessionCookies required.
 *
 *   - Book / cancel: NOT via this client — Tock's checkout uses an in-page
 *     Braintree CSRF flow that can't be replayed from raw fetch. Live book
 *     paths go through patchright in `book.ts`. This client only handles
 *     the read side.
 *
 * Cloudflare protects exploretock.com. Like OpenTable's Akamai layer, the
 * undici TLS fingerprint may 403. The provider's `auto` mode falls back to
 * a browser-driven scrape just like OpenTable does.
 */

import {
  NotFoundError,
  ProviderError,
  RateLimitError,
} from "../../core/errors.js";
import type { TockCredentials } from "./schemas.js";

const BASE_URL = "https://www.exploretock.com";
const DEFAULT_TIMEOUT_MS = 20000;

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface TockClientOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function buildHeaders(
  creds: TockCredentials | null,
  extra: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": CHROME_UA,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: BASE_URL,
    Referer: `${BASE_URL}/`,
    "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    ...extra,
  };
  if (creds?.sessionCookies) {
    headers.Cookie = creds.sessionCookies;
  }
  if (creds?.authToken) {
    headers.Authorization = `Bearer ${creds.authToken}`;
  }
  return headers;
}

export class TockClient {
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly creds: TockCredentials | null,
    opts: TockClientOptions = {},
  ) {
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /**
   * Restaurant search. Tock exposes an autocomplete endpoint used by the site
   * header search.
   */
  async searchRestaurants(params: { query: string; limit?: number }): Promise<unknown> {
    const qs = new URLSearchParams({
      q: params.query,
      limit: String(params.limit ?? 20),
    });
    return this.request("GET", `/api/consumer/v2/search/restaurants?${qs}`);
  }

  /**
   * Availability for a single venue / date / party size. The slug-style id is
   * Tock's primary key; numeric IDs are also accepted by the endpoint.
   */
  async getAvailability(params: {
    venueId: string;
    date: string; // YYYY-MM-DD
    partySize: number;
  }): Promise<unknown> {
    // venueId lives in the path; only date + size go in the query string.
    const qs = new URLSearchParams({
      date: params.date,
      size: String(params.partySize),
    });
    return this.request(
      "GET",
      `/api/consumer/v2/business/${encodeURIComponent(params.venueId)}/availability?${qs}`,
    );
  }

  /**
   * Restaurant detail by slug.
   */
  async getRestaurant(slug: string): Promise<unknown> {
    return this.request(
      "GET",
      `/api/consumer/v2/business/${encodeURIComponent(slug)}`,
    );
  }

  /** Logged-in user's upcoming reservations. */
  async listReservations(): Promise<unknown> {
    return this.request("GET", `/api/consumer/v2/me/reservations`);
  }

  /** Cancel by purchase id. Compound id from book result. */
  async cancelReservation(purchaseId: string): Promise<unknown> {
    return this.request(
      "POST",
      `/api/consumer/v2/purchase/${encodeURIComponent(purchaseId)}/cancel`,
      { body: "{}" },
    );
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
        headers: buildHeaders(this.creds, {
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(init.headers ?? {}),
        }),
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (res.status === 404) {
        throw new NotFoundError(`Tock ${method} ${path} → 404: ${text.slice(0, 300)}`);
      }
      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        throw new RateLimitError(
          `Tock ${method} ${path} → 429`,
          retryAfter ? Number(retryAfter) : undefined,
        );
      }
      if (!res.ok) {
        throw new ProviderError(
          `Tock ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`,
          "tock",
        );
      }
      try {
        return text ? JSON.parse(text) : null;
      } catch {
        throw new ProviderError(`Tock ${method} ${path}: non-JSON body`, "tock");
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
