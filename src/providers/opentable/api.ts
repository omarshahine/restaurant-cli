/**
 * OpenTable GraphQL API client (no browser).
 *
 * Direct hits to OpenTable's internal `/dapi/fe/gql` endpoint with:
 *   - CSRF token scraped from the opentable.com homepage HTML
 *   - Persisted query SHA256 hash for the `RestaurantsAvailability` op
 *   - Browser-realistic Chrome 131 headers
 *
 * Approach ported (clean reimplementation, no code copied) from the
 * openclaw-hub OpenTable plugin by Jeff Steinbok:
 *   https://github.com/JeffSteinbok/openclaw-hub/tree/main/plugins/opentable
 *
 * Jeff's Python uses `curl_cffi` to impersonate Chrome's TLS fingerprint as
 * an extra Akamai-bypass layer. Node's undici (the fetch backend) presents
 * a different fingerprint, so this path may still 403 on some IPs/regions.
 * The provider runs in `mode=auto` by default — it tries this API first and
 * falls back to the browser scrape if the GQL endpoint refuses us.
 *
 * Two flows:
 *   - lookupRestaurantId(slug)  → numeric restaurant ID via /r/<slug> HTML
 *   - gqlAvailability(rid, ...) → time slots via the GraphQL persisted query
 *
 * No auth/login. Both paths rely on undocumented internal APIs that may
 * change. The persisted-query hash is overridable via env var.
 */

import { ProviderError } from "../../core/errors.js";

const BASE_URL = "https://www.opentable.com";
const GQL_URL = `${BASE_URL}/dapi/fe/gql`;
const DEFAULT_TIMEOUT_MS = 20000;

/** Chrome 131 macOS UA — match what Jeff's curl_cffi impersonator sends. */
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Last known working persisted-query hash for `RestaurantsAvailability`.
 * Server-side registered, so it can't be auto-detected. Override via env:
 *   OPENTABLE_AVAILABILITY_HASH=<sha256>
 *
 * Sourced from the openclaw-hub plugin (2026-04). When OpenTable rotates,
 * extract a fresh hash from the network tab on opentable.com and set the
 * env var — no code change needed.
 */
const DEFAULT_AVAILABILITY_HASH =
  "b2d05a06151b3cb21d9dfce4f021303eeba288fac347068b29c1cb66badc46af";

export function getAvailabilityHash(): string {
  return process.env["OPENTABLE_AVAILABILITY_HASH"] ?? DEFAULT_AVAILABILITY_HASH;
}

interface SessionState {
  csrf: string | null;
  cookies: Map<string, string>;
}

const _session: SessionState = { csrf: null, cookies: new Map() };

/** Reset the cached CSRF + cookies. Used by tests. */
export function resetSession(): void {
  _session.csrf = null;
  _session.cookies.clear();
}

function cookieHeader(): string {
  return [..._session.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

/** Append `Set-Cookie` values from a fetch Response into the session jar. */
function ingestCookies(res: Response): void {
  const setCookies = (res.headers as unknown as { getSetCookie?: () => string[] })
    .getSetCookie?.();
  const lines = setCookies ?? [res.headers.get("set-cookie") ?? ""].filter(Boolean);
  for (const line of lines) {
    if (!line) continue;
    // Take the first `name=value;` pair, ignore attributes.
    const first = line.split(";")[0];
    if (!first) continue;
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const val = first.slice(eq + 1).trim();
    if (name && val) _session.cookies.set(name, val);
  }
}

/**
 * Pull `__CSRF_TOKEN__` out of the homepage HTML. OpenTable embeds it in a
 * window-vars script the rest of their app reads. Persist cookies from the
 * same response so the GQL endpoint sees a consistent session.
 */
async function ensureCsrf(timeoutMs: number, fetchImpl: typeof fetch): Promise<string> {
  if (_session.csrf) return _session.csrf;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${BASE_URL}/`, {
      headers: {
        "User-Agent": CHROME_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif," +
          "image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      signal: ctrl.signal,
    });

    if (!res.ok) {
      throw new ProviderError(
        `OpenTable homepage returned ${res.status} (CSRF acquisition failed)`,
        "opentable",
      );
    }

    ingestCookies(res);
    const html = await res.text();
    const m = html.match(/"__CSRF_TOKEN__":"([^"]+)"/);
    if (!m || !m[1]) {
      throw new ProviderError(
        "Could not extract CSRF token from OpenTable homepage",
        "opentable",
      );
    }
    _session.csrf = m[1];
    return m[1];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Make a persisted-query GraphQL POST. Returns parsed JSON on 200, throws
 * ProviderError otherwise (callers can catch + fall back to browser).
 */
async function gqlRequest(
  operationName: string,
  variables: Record<string, unknown>,
  sha256Hash: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<unknown> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const csrf = await ensureCsrf(timeoutMs, fetchImpl);

  const url = `${GQL_URL}?optype=query&opname=${encodeURIComponent(operationName)}`;
  const payload = {
    operationName,
    variables,
    extensions: { persistedQuery: { version: 1, sha256Hash } },
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "User-Agent": CHROME_UA,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        Origin: BASE_URL,
        Referer: `${BASE_URL}/`,
        "x-csrf-token": csrf,
        "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        ...(_session.cookies.size > 0 ? { Cookie: cookieHeader() } : {}),
      },
      signal: ctrl.signal,
    });
    ingestCookies(res);
    const text = await res.text();
    if (!res.ok) {
      throw new ProviderError(
        `OpenTable GQL ${operationName} → ${res.status}: ${text.slice(0, 300)}`,
        "opentable",
      );
    }
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      throw new ProviderError(
        `OpenTable GQL ${operationName}: non-JSON body`,
        "opentable",
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

// ---- Restaurant ID lookup -----------------------------------------------

export interface RestaurantLookupResult {
  restaurantId: string;
  slug: string;
  name?: string;
}

/**
 * Pure parser: extract restaurant ID + name from `/r/<slug>` HTML.
 * Exported for testing.
 *
 * OpenTable serves a `<script id="primary-window-vars">{json}</script>`
 * blob that contains `windowVariables.__OT_GA_DATA__.cd6` (the numeric
 * restaurant ID) and `cd1` (the display name). If that's missing, we fall
 * back to a `"restaurantId":<n>` regex over the whole page.
 */
export function parseRestaurantPageHtml(
  html: string,
  slug: string,
): RestaurantLookupResult | null {
  const pwv = html.match(
    /<script\s+id="primary-window-vars"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (pwv && pwv[1]) {
    try {
      const data = JSON.parse(pwv[1]) as {
        windowVariables?: {
          __OT_GA_DATA__?: { cd6?: string | number; cd1?: string };
        };
      };
      const ga = data.windowVariables?.__OT_GA_DATA__;
      const rid = ga?.cd6;
      if (rid !== undefined && rid !== null && String(rid).length > 0) {
        return {
          restaurantId: String(rid),
          slug,
          ...(ga?.cd1 ? { name: ga.cd1 } : {}),
        };
      }
    } catch {
      /* fall through to regex */
    }
  }

  const m = html.match(/"restaurantId"\s*:\s*(\d+)/);
  if (m && m[1]) {
    return { restaurantId: m[1], slug };
  }

  return null;
}

/**
 * Look up a restaurant's numeric ID from its URL slug
 * (e.g. `carbone-new-york` from `opentable.com/r/carbone-new-york`).
 *
 * Goes via the /r/ page rather than search, since OpenTable doesn't expose
 * a public text-search GraphQL operation. The page hides the ID inside a
 * `primary-window-vars` script tag.
 */
export async function lookupRestaurantId(
  slug: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<RestaurantLookupResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Acquire CSRF + cookies first — restaurant pages are similarly Akamai-gated
  // and benefit from the homepage warmup. The error is swallowed because the
  // /r/<slug> page sometimes serves itself anonymously, but we log under
  // DEBUG so a real homepage-side failure isn't hidden when the slug fetch
  // also fails downstream.
  await ensureCsrf(timeoutMs, fetchImpl).catch((csrfErr: unknown) => {
    if (process.env["RESTAURANT_CLI_DEBUG"]) {
      // eslint-disable-next-line no-console
      console.error(
        `[opentable] CSRF warmup failed (continuing without): ${(csrfErr as Error).message}`,
      );
    }
    return null;
  });

  const url = `${BASE_URL}/r/${encodeURIComponent(slug)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: {
        "User-Agent": CHROME_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif," +
          "image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: `${BASE_URL}/`,
        "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        ...(_session.cookies.size > 0 ? { Cookie: cookieHeader() } : {}),
      },
      signal: ctrl.signal,
    });
    ingestCookies(res);
    if (!res.ok) {
      throw new ProviderError(
        `OpenTable /r/${slug} → ${res.status}`,
        "opentable",
      );
    }
    const html = await res.text();
    const result = parseRestaurantPageHtml(html, slug);
    if (!result) {
      throw new ProviderError(
        `Could not extract restaurant ID for slug "${slug}"`,
        "opentable",
      );
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

// ---- GraphQL availability -----------------------------------------------

export interface GqlAvailabilityVariables {
  restaurantId: string | number;
  date: string; // YYYY-MM-DD
  partySize: number;
  /** HH:mm — the `time` here is the *anchor*; OpenTable returns slots as
   * `timeOffsetMinutes` from this anchor. Default 19:00. */
  time?: string;
}

/**
 * Raw GraphQL availability fetch. Returns the unmodified response body so
 * the parser can be tested independently.
 */
export async function gqlAvailability(
  vars: GqlAvailabilityVariables,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch; hash?: string } = {},
): Promise<unknown> {
  return gqlRequest(
    "RestaurantsAvailability",
    {
      restaurantIds: [Number(vars.restaurantId)],
      date: vars.date,
      time: vars.time ?? "19:00",
      partySize: Number(vars.partySize),
      databaseRegion: "NA",
    },
    opts.hash ?? getAvailabilityHash(),
    opts,
  );
}
