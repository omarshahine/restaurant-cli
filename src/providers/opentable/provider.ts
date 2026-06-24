import type {
  AuthStatus,
  AvailabilityQuery,
  BookRequest,
  BookResult,
  Credentials,
  Provider,
  Reservation,
  Slot,
} from "../types.js";
import { CapabilityError, ProviderError } from "../../core/errors.js";
import { requireSiteAutomationEnabled } from "../../core/gates.js";
import { searchVenues as searchVenuesImpl } from "./search.js";
import { buildBookingUrl } from "./deeplink.js";
import {
  getAvailability as getAvailabilityViaBrowser,
  getAvailabilityViaApi,
} from "./availability.js";

/**
 * OpenTable provider.
 *
 * Two paths to live data, picked by `RESTAURANT_CLI_OT_MODE`:
 *
 *   - `api` (fast, no browser)
 *       Hits `/dapi/fe/gql` directly with a CSRF token scraped from the
 *       homepage and a persisted-query SHA256 hash. Approach ported from
 *       Jeff Steinbok's openclaw-hub OpenTable plugin. May 403 on Akamai
 *       since Node's undici fingerprint differs from a real Chrome TLS
 *       handshake (Jeff's Python uses `curl_cffi` to dodge this).
 *
 *   - `browser` (slow, reliable)
 *       Drives the booking page with patchright + a persistent Chrome
 *       profile so Akamai's challenge JS passes. Falls back to
 *       `__NEXT_DATA__` parsing.
 *
 *   - `auto` (default)
 *       Try `api` first; if it throws (typically 403), fall back to browser.
 *
 * Search is still browser-only — OpenTable doesn't expose a public text
 * search GraphQL operation, only an autocomplete that needs DOM driving.
 *
 * Safety invariant from mikehe123/opentable-reservations: never auto-submit
 * a booking. Hand-off only via getBookingUrl.
 */

type OtMode = "api" | "browser" | "auto";

function getMode(): OtMode {
  const m = process.env["RESTAURANT_CLI_OT_MODE"];
  if (m === "api" || m === "browser" || m === "auto") return m;
  return "auto";
}

async function getAvailabilityDispatch(
  q: AvailabilityQuery,
  creds: Credentials,
): Promise<Slot[]> {
  // OpenTable has no official API — both the GraphQL persisted-query path and
  // the browser fallback automate the live site. Off by default.
  requireSiteAutomationEnabled("OpenTable availability lookup");
  const mode = getMode();
  if (mode === "api") {
    return getAvailabilityViaApi(q, creds);
  }
  if (mode === "browser") {
    return getAvailabilityViaBrowser(q, creds);
  }
  // auto: try API first, fall back to browser on 403/network errors.
  try {
    const slots = await getAvailabilityViaApi(q, creds);
    if (slots.length > 0) return slots;
    // Empty isn't necessarily an API failure — could be a fully-booked night.
    // But it could also be the persisted-query hash drifting and returning
    // {availability: [null]}. We err toward "trust the API" here; users who
    // want browser-confirmation can set RESTAURANT_CLI_OT_MODE=browser.
    return slots;
  } catch (err) {
    if (process.env["RESTAURANT_CLI_DEBUG"]) {
      // eslint-disable-next-line no-console
      console.error(
        `[opentable] api path failed, falling back to browser: ${(err as Error).message}`,
      );
    }
    // Fall back on the two failure modes Akamai actually produces:
    //   - ProviderError: a non-200 we converted (typically 403)
    //   - AbortError: AbortController fired because Akamai stalled the TLS
    //     handshake past our 20s timeout. Without this branch, the whole
    //     point of `auto` mode evaporates under the most common Akamai
    //     failure shape.
    const isAbort = err instanceof Error && err.name === "AbortError";
    if (err instanceof ProviderError || isAbort) {
      return getAvailabilityViaBrowser(q, creds);
    }
    throw err;
  }
}

export const openTableProvider: Provider = {
  id: "opentable",
  displayName: "OpenTable",
  capabilities: {
    // Browser-driven autocomplete search.
    search: true,
    // GraphQL persisted-query path (api.ts) is now the default and falls
    // back to the browser scrape on Akamai 403. Live as of the commit that
    // introduced the api/browser/auto switch.
    availability: true,
    book: false,
    cancel: false,
    list: false,
    snipe: false,
    bookUrl: true,
  },
  auth: {
    async validate(_creds: Credentials): Promise<AuthStatus> {
      const mode = getMode();
      const detail =
        mode === "api"
          ? "anonymous (GraphQL persisted-query path)"
          : mode === "browser"
            ? "anonymous (browser-driven via patchright)"
            : "anonymous (api with browser fallback)";
      return { ok: true, detail };
    },
    setupPrompts: () => [],
  },
  async searchVenues(q, creds) {
    // Browser-driven autocomplete on opentable.com — live-site automation.
    requireSiteAutomationEnabled("OpenTable search");
    return searchVenuesImpl(q, creds);
  },
  getAvailability: getAvailabilityDispatch,
  async book(_r: BookRequest, _creds: Credentials): Promise<BookResult> {
    throw new CapabilityError(
      "opentable",
      "book (use getBookingUrl for hand-off)",
    );
  },
  async cancel(): Promise<never> {
    throw new CapabilityError(
      "opentable",
      "cancel (browser automation milestone)",
    );
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
