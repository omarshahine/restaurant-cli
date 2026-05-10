/**
 * Tock HTTP client.
 *
 * Tock has no public consumer API. Live-probed reality (2026-05-10):
 *
 *   - Public surface lives at `https://www.exploretock.com/api/graphql/<Op>`
 *     (GraphQL, not REST). Operations observed on the Suzuki venue page:
 *       FetchBusinessAccolades, SafetyMeasuresForCurrentBusiness,
 *       BusinessFaqs, GetTockTenConfigsForCurrentBusiness.
 *     Search + availability operation names not yet captured (Suzuki's
 *     reservations weren't open during the probe — Tock releases on the
 *     15th of each month for the following month, so availability XHRs
 *     don't fire when there's nothing to render).
 *
 *   - Cloudflare protects the whole `/api/*` surface from raw fetch. undici
 *     gets 403 with a JS challenge. Trafilatura (urllib3) passes for some
 *     pages but not all — Cloudflare's per-page rules are aggressive on
 *     "hot" venues (Suzuki today returns 403; Kashiba returns 200).
 *
 *   - patchright + persistent profile + `channel: "chrome"` + ~5s mouse
 *     jitter passes Cloudflare reliably for both pages and `/api/graphql/*`.
 *     This is the verified-working path. See `browser.ts` for the launch
 *     config; the search/availability XHR capture pipeline is the next
 *     session's work.
 *
 *   - Anonymous reads CANNOT work without one of:
 *       (a) imported session cookies via `restaurant auth login tock`
 *       (b) the patchright fallback (next session)
 *
 * This client retains the GraphQL request shape so the next iteration can
 * wire it up against the right operation names. Today every call returns
 * the Cloudflare 403 unless `creds.sessionCookies` is populated AND those
 * cookies are still valid.
 */

import {
  NotFoundError,
  ProviderError,
  RateLimitError,
} from "../../core/errors.js";
import type { TockCredentials } from "./schemas.js";

const BASE_URL = "https://www.exploretock.com";
const GQL_URL = `${BASE_URL}/api/graphql`;
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
   * GraphQL operation by name. The Tock frontend POSTs to
   * `/api/graphql/<OperationName>` with `{operationName, variables, query?}`.
   * We send the operation name in the URL (as the page does) and the
   * variables in the body. Real persisted-query hashes are unknown today;
   * Tock may require sending the full GraphQL string, which we don't have.
   *
   * Today this exists as scaffolding so the browser fallback can call into
   * the same shape later. Direct invocation still 403s on Cloudflare.
   */
  async gql(operationName: string, variables: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `${GQL_URL}/${encodeURIComponent(operationName)}`, {
      body: JSON.stringify({ operationName, variables }),
    });
  }

  /**
   * Search — TODO: capture real operation name + variable shape from a
   * live page interaction. Likely candidates from Tock's frontend:
   * `SearchBusinesses`, `Autocomplete`, `SearchRestaurants`. Today this
   * throws ProviderError with the Cloudflare body so callers see why.
   */
  async searchRestaurants(_params: { query: string; limit?: number }): Promise<unknown> {
    throw new ProviderError(
      "tock_search_unverified: real GraphQL operation name not yet captured. " +
        "Browser fallback pending. Direct API access is Cloudflare-blocked.",
      "tock",
    );
  }

  /**
   * Availability — TODO: capture real operation name. Likely candidates:
   * `BusinessAvailability`, `GetExperienceAvailability`, `SearchAvailability`.
   */
  async getAvailability(_params: {
    venueId: string;
    date: string;
    partySize: number;
  }): Promise<unknown> {
    throw new ProviderError(
      "tock_availability_unverified: real GraphQL operation name not yet captured. " +
        "Browser fallback pending. Direct API access is Cloudflare-blocked.",
      "tock",
    );
  }

  /**
   * Restaurant detail — the `/<slug>` page renders this from a known GQL
   * op; we can extract the operation name from a page probe but it's not
   * critical until search lands.
   */
  async getRestaurant(slug: string): Promise<unknown> {
    return this.request(
      "GET",
      `${BASE_URL}/api/consumer/business/${encodeURIComponent(slug)}`,
    );
  }

  /** Logged-in user's reservations. Requires session cookies. */
  async listReservations(): Promise<unknown> {
    return this.gql("CurrentBookerReservations", {});
  }

  /** Cancel by purchase id. Requires session cookies. */
  async cancelReservation(purchaseId: string): Promise<unknown> {
    return this.gql("CancelReservation", { purchaseId });
  }

  private async request(
    method: "GET" | "POST",
    fullUrl: string,
    init: { headers?: Record<string, string>; body?: string } = {},
  ): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(fullUrl, {
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
        throw new NotFoundError(`Tock ${method} ${fullUrl} → 404: ${text.slice(0, 300)}`);
      }
      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        throw new RateLimitError(
          `Tock ${method} ${fullUrl} → 429`,
          retryAfter ? Number(retryAfter) : undefined,
        );
      }
      if (!res.ok) {
        throw new ProviderError(
          `Tock ${method} ${fullUrl} → ${res.status}: ${text.slice(0, 500)}`,
          "tock",
        );
      }
      try {
        return text ? JSON.parse(text) : null;
      } catch {
        throw new ProviderError(`Tock ${method} ${fullUrl}: non-JSON body`, "tock");
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
