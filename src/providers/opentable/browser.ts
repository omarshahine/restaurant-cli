/**
 * Browser-driven OpenTable fetcher — ACCESS proven, SCRAPING still TODO.
 *
 * OpenTable's /dapi/ endpoints are protected by Akamai Bot Manager. Live
 * probing (2026-04-17) mapped the exact recipe that defeats the anti-bot
 * check AND the follow-up combinations that extend its effectiveness:
 *
 *   ✓ **Working recipe for page access**:
 *     - `patchright` (stealth-patched Playwright fork), not plain `playwright`
 *     - `chromium.launchPersistentContext(profileDir, { channel: "chrome" })` —
 *       system Chrome binary, persistent profile to accumulate trust cookies
 *     - `headless: false` (headless mode still trips Akamai's JS checks)
 *     - Mouse-jitter interaction for ~4-5 seconds after navigation so
 *       Akamai's client-side challenge JS passes
 *     - `--disable-blink-features=AutomationControlled` launch arg
 *
 *   With those applied: navigation returns 200, title populates correctly
 *   ("Restaurant Reservation Availability | OpenTable"), and the page's own
 *   XHRs to `/dapi/fe/gql?opname=<Autocomplete|LocationPicker|...>` return
 *   real structured JSON.
 *
 * What does NOT work yet (the remaining engineering):
 *   - Calling `/dapi/fe/gql` from within page context via `fetch()` — 403.
 *     The page's own fetches include headers (CSRF / persisted query hash /
 *     ot-origin) that aren't obvious to replicate.
 *   - `locator.type()` into the search input — times out, likely an overlay
 *     or focus issue we didn't finish debugging.
 *
 * What DOES work for harvesting data today:
 *   - Observing the page's own XHRs via `page.on("response", ...)` and
 *     filtering for `opname=<Autocomplete|RestaurantsAvailability>`. The
 *     probe captured a real 11KB Autocomplete response with 30 results.
 *     Turning that into a deterministic scrape needs triggering the page's
 *     own search flow (typing in the box, or navigating to a URL the page
 *     turns into a specific query).
 *
 * Next session plan:
 *   1. Trigger the page's search via `page.keyboard.type()` after click;
 *      debug why `locator.type()` times out.
 *   2. Alternative: navigate to `/r/<slug>` restaurant profile pages and
 *      scrape rendered availability tiles from the DOM (bypasses the GQL
 *      request-shape problem entirely for known restaurants).
 *   3. Wire a real `searchViaBrowser` → parseAutocomplete pipeline.
 *   4. Flip `capabilities.search = true` in provider.ts.
 *
 * Until those land, OpenTable capabilities stay `bookUrl: true` only. The
 * scaffolding below holds the verified-working launch/stealth config so
 * the next attempt starts from a known-good base.
 *
 * Safety invariant (from mikehe123/opentable-reservations): this module is
 * READ-ONLY. Nothing in here can complete a booking.
 *
 * Playwright and patchright are both optional peerDependencies. The core
 * CLI works without them; `loadPlaywright()` dynamically imports at call
 * time.
 */

// Type-only import so tsc is happy even when playwright isn't installed at
// compile time. The value-side import is dynamic (below) for that reason.
import type { Browser, BrowserContext, Page } from "playwright";

export interface BrowserFetchOptions {
  /** Headless by default. Set RESTAURANT_CLI_HEADED=1 to see the browser. */
  headed?: boolean;
  /** Override default 30s timeout. */
  timeoutMs?: number;
}

type PlaywrightModule = typeof import("playwright");

async function loadPlaywright(): Promise<PlaywrightModule> {
  // Prefer patchright (stealth-patched) when available; fall back to plain
  // playwright. Patchright is the difference between "Akamai serves an
  // Access Denied page after a ~10s JS challenge" and "Akamai passes."
  try {
    return (await import("patchright" as string)) as PlaywrightModule;
  } catch {
    /* fallthrough to playwright */
  }
  try {
    return (await import("playwright")) as PlaywrightModule;
  } catch (e) {
    throw new Error(
      "Neither `patchright` nor `playwright` is installed. For OpenTable " +
        "live data, install patchright (better stealth):\n" +
        "  npm i -g patchright && npx playwright install chromium\n" +
        `(original error: ${(e as Error).message})`,
    );
  }
}

/** Tweaks to make Playwright's Chromium less obviously automated. */
const STEALTH_INIT_SCRIPT = `
  // Hide the webdriver flag most bot-detection scripts check first.
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  // Plugins length — default headless has 0; real Chrome has 3-5.
  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5].map(() => ({ name: 'pdf-plugin' })),
  });
  // Languages
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  // Chrome runtime stub
  window.chrome = { runtime: {} };
`;

const REAL_CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Launch a browser with the stealth + profile combo live-verified to defeat
 * Akamai on opentable.com. The profile dir is reused across calls so trust
 * cookies accumulate — do not delete it casually.
 */
async function launch(
  opts: BrowserFetchOptions = {},
): Promise<{ browser: Browser | null; context: BrowserContext; page: Page }> {
  const pw = await loadPlaywright();
  const headed = opts.headed ?? process.env["RESTAURANT_CLI_HEADED"] === "1";
  const useSystemChrome = process.env["RESTAURANT_CLI_BROWSER_CHANNEL"] !== "chromium";
  const profileDir =
    process.env["RESTAURANT_CLI_OT_PROFILE_DIR"] ??
    `${process.env["HOME"]}/.cache/restaurant-cli/chrome-profile-opentable`;

  const context = await pw.chromium.launchPersistentContext(profileDir, {
    headless: !headed && false /* force headed until headless trust path is proven */,
    ...(useSystemChrome ? { channel: "chrome" } : {}),
    viewport: { width: 1400, height: 900 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(opts.timeoutMs ?? 30000);
  return { browser: null, context, page };
}

async function close(
  handles: { browser: Browser | null; context: BrowserContext; page: Page },
): Promise<void> {
  try {
    await handles.page.close();
  } catch {
    /* ignore */
  }
  try {
    await handles.context.close();
  } catch {
    /* ignore */
  }
  if (handles.browser) {
    try {
      await handles.browser.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Human-ish wait to let Akamai's client-side challenge JS finish and pass.
 * Mouse movement is the signal Akamai weights most.
 */
async function warmup(page: Page, ms: number = 4500): Promise<void> {
  const start = Date.now();
  let i = 0;
  while (Date.now() - start < ms) {
    await page.mouse.move(100 + i * 50, 200 + ((i * 37) % 400));
    await page.waitForTimeout(400);
    i++;
  }
}

/**
 * Search OpenTable by sniffing the Autocomplete GraphQL response the page
 * makes as it renders.
 *
 * Status (2026-04-17): the launch + stealth config here is live-verified to
 * load the page past Akamai. Triggering a deterministic name-search call is
 * still TODO — the file-level comment has the next-session plan.
 */
export async function searchViaBrowser(
  query: string,
  _opts: { covers?: number; limit?: number } = {},
  launchOpts: BrowserFetchOptions = {},
): Promise<unknown> {
  const handles = await launch(launchOpts);
  try {
    const responses: unknown[] = [];
    handles.page.on("response", async (resp) => {
      const u = resp.url();
      if (!u.includes("opname=Autocomplete")) return;
      try {
        const ct = resp.headers()["content-type"] ?? "";
        if (!ct.includes("json")) return;
        const body = await resp.text();
        if (body.length > 200) responses.push(JSON.parse(body));
      } catch {
        /* ignore */
      }
    });

    const url = `https://www.opentable.com/s?term=${encodeURIComponent(query)}`;
    await handles.page.goto(url, { waitUntil: "domcontentloaded" });
    await warmup(handles.page);

    // Return the last (most populated) Autocomplete response. Parsing moves
    // to opentable/search.ts::parseAutocompleteResponse when we wire this up.
    return responses.length ? responses[responses.length - 1] : null;
  } finally {
    await close(handles);
  }
}

/**
 * Availability lookup via the booking page. We navigate to
 * `opentable.com/booking/experiences-availability?rid=<id>&datetime=<ts>&covers=<n>`
 * and extract slot data from page context.
 *
 * Returns the raw page-side JSON; parsing happens in availability.ts so the
 * transport stays swappable.
 */
export async function availabilityViaBrowser(
  params: { restaurantId: string; date: string; partySize: number },
  launchOpts: BrowserFetchOptions = {},
): Promise<unknown> {
  const handles = await launch(launchOpts);
  try {
    const url =
      `https://www.opentable.com/booking/experiences-availability` +
      `?rid=${encodeURIComponent(params.restaurantId)}` +
      `&datetime=${params.date}T19:00` +
      `&covers=${params.partySize}`;
    await handles.page.goto(url, { waitUntil: "domcontentloaded" });

    const data = await handles.page.evaluate(
      `(() => {
        var n = document.getElementById('__NEXT_DATA__');
        if (n && n.textContent) { try { return JSON.parse(n.textContent); } catch (e) {} }
        return null;
      })()`,
    );
    return data;
  } finally {
    await close(handles);
  }
}
