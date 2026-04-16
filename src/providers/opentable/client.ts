/**
 * OpenTable HTTP client.
 *
 * OpenTable has no public/documented API as of 2026. This client hits the
 * same `/dapi/` endpoints the opentable.com React app uses, with
 * browser-realistic headers. Used for search + availability only; booking
 * requires a logged-in session and CSRF dance that is out of scope for the
 * HTTP path (book-path lives behind browser automation later).
 *
 * Reverse-engineering landscape documented at:
 *   - github.com/jrklein343-svg/restaurant-mcp (older, uses the dead restref/api)
 *   - github.com/jallenschuler/restaurant-butler (2026-03, active, uses /dapi)
 *   - github.com/gabehassan/noresi (2026-04, active, uses /dapi)
 *   - github.com/mikehe123/opentable-reservations (2026-04, Chrome CDP path)
 *
 * No code is copied from any of those projects — this is a clean
 * reimplementation. Endpoint knowledge is the only shared artifact.
 */

import { ProviderError } from "../../core/errors.js";

const BASE_URL = "https://www.opentable.com";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface OpenTableClientOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

/**
 * Known-good GraphQL operation used by the OT search page. The opentable.com
 * frontend posts persisted queries, but the server also accepts ad-hoc
 * queries, which keeps us independent of their persisted-query hash rotation.
 */
const SEARCH_QUERY = /* GraphQL */ `
  query RestaurantsAvailability(
    $term: String
    $metroId: Int
    $dateTime: String
    $covers: Int
    $first: Int
  ) {
    search(
      term: $term
      metroId: $metroId
      dateTime: $dateTime
      covers: $covers
      first: $first
    ) {
      results {
        restaurant {
          restaurantId
          name
          neighborhood { name }
          metroName
          priceBand { priceBandId name }
          primaryCuisine { name }
          statistics { reviews { allTimeTextReviewCount ratings { overall { rating } } } }
          urls { profileLink { link } }
        }
      }
    }
  }
`;

export class OpenTableClient {
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(opts: OpenTableClientOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  }

  /**
   * Free-text restaurant search via the consumer GraphQL endpoint.
   * see: opentable.com uses POST /dapi/fe/graphql internally on its search page
   */
  async searchRestaurants(params: {
    term: string;
    dateTime?: string; // ISO local time, e.g. "2026-05-01T19:00"
    covers?: number;
    first?: number;
  }): Promise<unknown> {
    return this.request("POST", "/dapi/fe/graphql", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "RestaurantsAvailability",
        variables: {
          term: params.term,
          ...(params.dateTime ? { dateTime: params.dateTime } : {}),
          covers: params.covers ?? 2,
          first: params.first ?? 20,
        },
        query: SEARCH_QUERY,
      }),
    });
  }

  /**
   * Availability for a known restaurant.
   * see: opentable.com/dapi/booking/restaurant/{rid}/availability
   */
  async getAvailability(params: {
    restaurantId: string | number;
    dateTime: string; // ISO local time, e.g. "2026-05-01T19:00"
    partySize: number;
  }): Promise<unknown> {
    const qs = new URLSearchParams({
      covers: String(params.partySize),
      dateTime: params.dateTime,
    });
    return this.request(
      "GET",
      `/dapi/booking/restaurant/${encodeURIComponent(String(params.restaurantId))}/availability?${qs.toString()}`,
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
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Origin: BASE_URL,
          Referer: `${BASE_URL}/`,
          ...(init.headers ?? {}),
        },
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new ProviderError(
          `OpenTable ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`,
          "opentable",
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
