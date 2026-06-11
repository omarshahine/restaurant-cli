/**
 * Browser-driven OpenTable fetcher.
 *
 * OpenTable has no official public API, so reading availability means driving
 * a real browser against the live site, which is protected by Akamai Bot
 * Manager. This module launches a stealth-patched Chromium (patchright) with a
 * persistent profile to load the page the same way a normal browser would,
 * then reads the availability data the page itself fetches. This is automation
 * against a third party that may be contrary to OpenTable's Terms of Service —
 * the user is warned at runtime (see `warnBrowserAutomation`), and it is opt-in
 * via the OpenTable provider path. Playwright/patchright are optional peer
 * dependencies, so the core CLI does not pull them in.
 *
 * Capability scope: availability reads only. This module is READ-ONLY —
 * nothing here can complete or modify a booking. OpenTable provider
 * capabilities stay `bookUrl: true` (hand-off via deep link), not auto-book.
 *
 * Implementation note: data is read by observing the page's own XHR responses
 * rather than replaying its internal GraphQL calls (those carry per-session
 * CSRF/persisted-query headers). Search-by-typing is not yet wired, so
 * `capabilities.search` remains false in provider.ts.
 */

// Type-only import so tsc is happy even when playwright isn't installed at
// compile time. The value-side import is dynamic (below) for that reason.
import type { Browser, BrowserContext, Page } from "playwright";
import { warnBrowserAutomation } from "../../core/warnings.js";

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
 *
 * Headless does NOT work — tested 2026-04-18 (#4). Even with a warmed
 * persistent profile (trust cookies present, no cold-start challenge),
 * Akamai drops the HTTP/2 connection mid-request from headless Chrome with
 * `ERR_HTTP2_PROTOCOL_ERROR`. Their detection examines render-loop timing,
 * WebGL fingerprints, and window properties that differ between headless
 * and real Chrome even in Chromium's "new" headless mode. Patchright helps
 * with some signals but not these. Headed is required until we either
 * (a) get a true in-OS window layer (macOS virtual display), or
 * (b) move to a CDP connection against a real Chrome Omar already has open.
 *
 * Override via env vars:
 *   RESTAURANT_CLI_HEADLESS=1     → attempt headless anyway (will likely fail)
 *   RESTAURANT_CLI_OT_PROFILE_DIR → use a different profile dir
 */
async function launch(
  opts: BrowserFetchOptions = {},
): Promise<{ browser: Browser | null; context: BrowserContext; page: Page }> {
  // Disclose (once) that we're automating the live site with a persistent
  // profile — there is no official API and this may be against OpenTable's ToS.
  warnBrowserAutomation("OpenTable", "browser-profile");
  const pw = await loadPlaywright();
  const useSystemChrome = process.env["RESTAURANT_CLI_BROWSER_CHANNEL"] !== "chromium";
  const profileDir =
    process.env["RESTAURANT_CLI_OT_PROFILE_DIR"] ??
    `${process.env["HOME"]}/.cache/restaurant-cli/chrome-profile-opentable`;

  // Default headed. Only flip to headless if the user opts in explicitly.
  const forceHeadless = process.env["RESTAURANT_CLI_HEADLESS"] === "1";
  const headed = !forceHeadless && (opts.headed ?? true);

  const context = await pw.chromium.launchPersistentContext(profileDir, {
    headless: !headed,
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
 * Search OpenTable by driving the homepage autocomplete and sniffing the
 * `/dapi/fe/gql?opname=Autocomplete` response the page makes in reply.
 *
 * Verified live (2026-04-17): 30-item restaurant list returned for typed
 * queries. Parser lives in search.ts::parseAutocompleteResponse.
 *
 * City disambiguation (2026-04-18): if `opts.city` is provided, we prepend
 * it to the typed query as a single autocomplete input — OpenTable's
 * autocomplete takes multi-token input and biases restaurant results
 * toward the metro we named. This avoids a separate location-picker
 * interaction (the homepage has a single dual-purpose input). Trade-off:
 * a restaurant name containing the city name will be weirdly duplicated
 * in the typed string, but autocomplete tolerates that fine. Live-probe
 * confirmed the homepage DOM has exactly one input
 * (`#home-page-autocomplete-input`); the "location-update-button" only
 * triggers browser geolocation, not a city-by-name picker.
 */
export async function searchViaBrowser(
  query: string,
  opts: { covers?: number; limit?: number; city?: string } = {},
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

    await handles.page.goto("https://www.opentable.com/", {
      waitUntil: "domcontentloaded",
    });
    await warmup(handles.page);

    // Dismiss OneTrust cookie banner — without this, the search input
    // receives clicks but the page doesn't respond to focus.
    await handles.page.evaluate(
      `(() => {
        var ids = ['onetrust-accept-btn-handler','accept-recommended-btn-handler'];
        for (var i=0; i<ids.length; i++) {
          var el = document.getElementById(ids[i]);
          if (el) { el.click(); return; }
        }
      })()`,
    );
    await handles.page.waitForTimeout(1000);

    // Focus via JS (locator.type() trips on the OneTrust layer), then use
    // page.keyboard.type so React's _valueTracker registers real keystrokes.
    await handles.page.evaluate(
      `(() => {
        var el = document.getElementById('home-page-autocomplete-input');
        if (el) { el.focus(); el.click(); }
      })()`,
    );
    await handles.page.waitForTimeout(400);

    // Prepend the city as an autocomplete token so OpenTable geo-biases
    // toward that metro. If no --city, just type the query.
    const typed = opts.city ? `${opts.city} ${query}` : query;
    await handles.page.keyboard.type(typed, { delay: 70 });

    // Wait for debounced autocomplete (~300ms debounce + network RTT).
    await handles.page.waitForTimeout(3500);

    // Return the biggest captured response — the last one is usually the
    // fullest-term match. Parsing moves to search.ts.
    if (!responses.length) return null;
    const biggest = responses.reduce((a: any, b: any) =>
      JSON.stringify(b).length > JSON.stringify(a).length ? b : a,
    );
    return biggest;
  } finally {
    await close(handles);
  }
}

/**
 * Availability lookup via the booking page. We navigate to
 * `opentable.com/restref/client?...` which OpenTable 302s to
 * `/booking/restref/availability?rid=<id>&correlationId=<uuid>&restRef=<id>&partySize=<n>&dateTime=<ts>`
 * and extract slot data from page context.
 *
 * URL shape was updated on 2026-04-18 after the prior
 * `/booking/experiences-availability` endpoint started returning 400 (see
 * issue #16). The redirect-based path is the shape OpenTable's own
 * affiliate links still use today.
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
      `https://www.opentable.com/restref/client` +
      `?rid=${encodeURIComponent(params.restaurantId)}` +
      `&restref=${encodeURIComponent(params.restaurantId)}` +
      `&partysize=${params.partySize}` +
      `&datetime=${params.date}T19:00`;
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
