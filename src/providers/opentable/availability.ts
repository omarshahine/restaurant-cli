import type { AvailabilityQuery, Credentials, Slot } from "../types.js";
import { OpenTableClient } from "./client.js";
import { buildBookingUrl } from "./deeplink.js";
import { availabilityViaBrowser } from "./browser.js";
import { gqlAvailability } from "./api.js";

/**
 * Two parsers live in this file because OpenTable's availability data
 * reaches us through two different shapes:
 *
 *   1. `parseAvailabilityResponse` — reads the legacy `/dapi/` JSON
 *      (`availability.times[]`). Kept for parser tests; the live HTTP path is
 *      dead (Akamai).
 *   2. `parseNextDataAvailabilityResponse` — reads the `__NEXT_DATA__`
 *      hydration payload that the `/booking/experiences-availability`
 *      SSR page embeds in its HTML. This is the *live* path available today
 *      via browser automation (see `browser.ts::availabilityViaBrowser`).
 *
 * The Next.js hydration shape is stable enough for a scrape but OpenTable
 * iterates on it; we walk defensively and support multiple anchor paths.
 */

interface DapiAvailabilityResponse {
  availability?: {
    times?: Array<{
      dateTime?: string;
      time?: string;
      slotHash?: string;
      available?: boolean;
      attributes?: { category?: string };
    }>;
  };
  times?: Array<{
    dateTime?: string;
    time?: string;
    slotHash?: string;
    available?: boolean;
    attributes?: { category?: string };
  }>;
}

/**
 * Pure parser: `/dapi/booking/restaurant/{rid}/availability` → Slot[]. Kept
 * independent of the HTTP transport so a browser-automation fetcher (CDP)
 * can feed the same JSON shape through this function.
 */
export function parseAvailabilityResponse(
  raw: unknown,
  ctx: { venueId: string; date: string; partySize: number },
): Slot[] {
  const r = raw as DapiAvailabilityResponse;
  const times = r?.availability?.times ?? r?.times ?? [];
  return times
    .filter((t) => t.available !== false && (t.time || t.dateTime))
    .map((t): Slot => {
      const time = t.time ?? (t.dateTime ?? "").slice(11, 16);
      return {
        token: buildBookingUrl({
          restaurantId: ctx.venueId,
          date: ctx.date,
          time,
          partySize: ctx.partySize,
        }),
        time,
        ...(t.slotHash ? { configId: t.slotHash } : {}),
        ...(t.attributes?.category ? { type: t.attributes.category } : {}),
        raw: t,
      };
    });
}

// ---- __NEXT_DATA__ parser (browser scrape) -------------------------------

interface NextSlotRaw {
  timeOffsetMinutes?: number;
  dateTime?: string;
  time?: string;
  slotHash?: string;
  slotAvailabilityToken?: string;
  attributes?: { category?: string; diningArea?: string };
  available?: boolean;
  isSoldOut?: boolean;
  experienceName?: string;
  type?: string;
}

/**
 * Drill into a __NEXT_DATA__ object to find the availability slots list.
 * OpenTable places it behind a few different wrappers across page variants,
 * so we search by shape rather than a fixed path.
 *
 * Returns `[]` if nothing matches — the caller can report "no slots" rather
 * than throwing (at the scrape-layer nothing has intrinsically failed).
 */
export function findSlotsInNextData(nd: unknown): NextSlotRaw[] {
  if (!nd || typeof nd !== "object") return [];

  // Candidate paths, most → least specific. These were picked from the
  // shapes Next.js SSR pages typically embed, not from a live OpenTable
  // response (the parser has not yet been verified end-to-end). If the
  // primary paths miss, the BFS fallback below scans the tree for an array
  // whose first element smells like a slot. Update this list when a real
  // live response becomes available.
  const candidatePaths: string[][] = [
    ["props", "pageProps", "initialData", "availabilityData", "availability", "times"],
    ["props", "pageProps", "initialData", "availability", "times"],
    ["props", "pageProps", "initialData", "restaurantAvailability", "times"],
    ["props", "pageProps", "availability", "times"],
    ["props", "pageProps", "slots"],
    ["props", "pageProps", "initialData", "slots"],
  ];

  for (const path of candidatePaths) {
    const hit = walk(nd, path);
    if (Array.isArray(hit) && hit.length > 0) {
      return hit as NextSlotRaw[];
    }
  }

  // Last-resort: BFS for an array whose first element looks like a slot.
  return bfsSlotArray(nd) ?? [];
}

function walk(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function bfsSlotArray(obj: unknown, maxDepth: number = 6): NextSlotRaw[] | null {
  const queue: Array<{ v: unknown; d: number }> = [{ v: obj, d: 0 }];
  while (queue.length) {
    const { v, d } = queue.shift()!;
    if (d > maxDepth || !v || typeof v !== "object") continue;
    if (Array.isArray(v) && v.length > 0) {
      const first = v[0] as Record<string, unknown> | undefined;
      if (
        first &&
        typeof first === "object" &&
        (typeof first["time"] === "string" ||
          typeof first["dateTime"] === "string" ||
          typeof first["slotAvailabilityToken"] === "string")
      ) {
        return v as NextSlotRaw[];
      }
    } else {
      for (const val of Object.values(v as Record<string, unknown>)) {
        queue.push({ v: val, d: d + 1 });
      }
    }
  }
  return null;
}

/**
 * Pure parser: `__NEXT_DATA__` hydration blob → Slot[]. Takes `ctx` for
 * generating a deep-link token per slot (the slot's own `slotAvailabilityToken`
 * is preserved on `raw` + `configId` when present).
 *
 * Not live-verified as of the commit that introduced it. Parser is defensive
 * — if OpenTable moves the data it returns `[]` rather than crashing.
 */
export function parseNextDataAvailabilityResponse(
  raw: unknown,
  ctx: { venueId: string; date: string; partySize: number },
): Slot[] {
  const slots = findSlotsInNextData(raw);
  const out: Slot[] = [];
  for (const s of slots) {
    if (s.available === false || s.isSoldOut === true) continue;
    const time = s.time ?? (s.dateTime ?? "").slice(11, 16);
    if (!time) continue;
    out.push({
      token: buildBookingUrl({
        restaurantId: ctx.venueId,
        date: ctx.date,
        time,
        partySize: ctx.partySize,
      }),
      time,
      ...(s.slotHash || s.slotAvailabilityToken
        ? { configId: String(s.slotHash ?? s.slotAvailabilityToken) }
        : {}),
      ...(s.attributes?.category || s.attributes?.diningArea || s.type
        ? { type: s.attributes?.category ?? s.attributes?.diningArea ?? s.type }
        : {}),
      raw: s,
    });
  }
  return out;
}

/**
 * Live availability via browser scrape.
 *
 * Drives the `/booking/experiences-availability` SSR page with patchright
 * (same Akamai-bypassing launch config as search) and parses the embedded
 * `__NEXT_DATA__` blob.
 *
 * Status: the transport is wired but the parser is best-effort. The caller
 * (`Provider.getAvailability`) is gated on `capabilities.availability` which
 * remains `false` until the parser is live-verified against a real response.
 */
export async function getAvailability(
  q: AvailabilityQuery,
  _creds: Credentials,
): Promise<Slot[]> {
  const raw = await availabilityViaBrowser({
    restaurantId: q.venueId,
    date: q.date,
    partySize: q.partySize,
  });
  return parseNextDataAvailabilityResponse(raw, {
    venueId: q.venueId,
    date: q.date,
    partySize: q.partySize,
  });
}

/** Legacy HTTP path kept for parser tests; not used by Provider. */
export async function getAvailabilityHttp(q: AvailabilityQuery): Promise<Slot[]> {
  const client = new OpenTableClient();
  const dateTime = `${q.date}T19:00`;
  const raw = await client.getAvailability({
    restaurantId: q.venueId,
    dateTime,
    partySize: q.partySize,
  });
  return parseAvailabilityResponse(raw, {
    venueId: q.venueId,
    date: q.date,
    partySize: q.partySize,
  });
}

// ---- GraphQL persisted-query parser (api.ts path) ------------------------

/**
 * Shape of one slot inside `data.availability[0].availabilityDays[0].slots[]`
 * from the `RestaurantsAvailability` persisted GraphQL query.
 *
 * `timeOffsetMinutes` is signed minutes from the `time` variable sent on the
 * request (the anchor). E.g. anchor 19:00 + offset 30 = 19:30 slot.
 */
interface GqlAvailabilitySlot {
  isAvailable?: boolean;
  timeOffsetMinutes?: number;
  slotHash?: string;
  type?: string;
  attributes?: unknown[];
}

interface GqlAvailabilityResponse {
  data?: {
    availability?: Array<{
      availabilityDays?: Array<{
        slots?: GqlAvailabilitySlot[];
      }>;
    } | null>;
  };
}

function addMinutesToTime(anchor: string, offset: number): string {
  const m = anchor.match(/^(\d{1,2}):(\d{2})$/);
  if (!m || !m[1] || !m[2]) return anchor;
  const total = Number(m[1]) * 60 + Number(m[2]) + offset;
  // Wrap into [0, 1440) — OpenTable shouldn't return overflowing offsets in
  // practice, but cheap to handle defensively.
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const min = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Pure parser: `RestaurantsAvailability` GraphQL response → Slot[]. The
 * response keys slots by `timeOffsetMinutes` from a request-side anchor;
 * the caller passes `anchorTime` (defaults 19:00) so we can resolve absolute
 * times.
 *
 * Drops slots where `isAvailable` is explicitly `false`. Missing flag is
 * treated as available (matches OpenTable's UI behavior).
 */
export function parseGqlAvailabilityResponse(
  raw: unknown,
  ctx: { venueId: string; date: string; partySize: number; anchorTime?: string },
): Slot[] {
  const r = raw as GqlAvailabilityResponse;
  const availability = r?.data?.availability ?? [];
  if (!availability.length) return [];

  const restaurant = availability[0];
  if (!restaurant) return [];

  const days = restaurant.availabilityDays ?? [];
  if (!days.length) return [];

  const day = days[0];
  if (!day) return [];

  const rawSlots = day.slots ?? [];
  const anchor = ctx.anchorTime ?? "19:00";

  return rawSlots
    .filter((s) => s.isAvailable !== false)
    .map((s): Slot => {
      const time = addMinutesToTime(anchor, s.timeOffsetMinutes ?? 0);
      return {
        token: buildBookingUrl({
          restaurantId: ctx.venueId,
          date: ctx.date,
          time,
          partySize: ctx.partySize,
        }),
        time,
        ...(s.slotHash ? { configId: s.slotHash } : {}),
        ...(s.type ? { type: s.type } : {}),
        raw: s,
      };
    });
}

/**
 * Live availability via the GraphQL persisted-query path (no browser).
 *
 * Acquires CSRF + cookies from the homepage, then POSTs to /dapi/fe/gql
 * with the `RestaurantsAvailability` persisted hash. Fast (~2 round trips,
 * no headless render) but may 403 on Akamai if undici's TLS fingerprint is
 * flagged. The provider's `auto` mode falls back to the browser scrape on
 * failure.
 */
export async function getAvailabilityViaApi(
  q: AvailabilityQuery,
  _creds: Credentials,
): Promise<Slot[]> {
  const raw = await gqlAvailability({
    restaurantId: q.venueId,
    date: q.date,
    partySize: q.partySize,
  });
  return parseGqlAvailabilityResponse(raw, {
    venueId: q.venueId,
    date: q.date,
    partySize: q.partySize,
  });
}
