/**
 * Browser-driven OpenTable fetcher — SCAFFOLD, not yet defeating Akamai.
 *
 * OpenTable's /dapi/ endpoints are protected by Akamai Bot Manager. Pure
 * Node fetch() gets 403 because Akamai reads the TLS fingerprint. We
 * expected that launching real Chromium (via Playwright with the `chrome`
 * channel + stealth init scripts + full UA) would defeat the block, but
 * live testing (2026-04-17) showed:
 *
 *   - Playwright bundled Chromium → 403 at Akamai edge
 *   - System Chrome via `channel: "chrome"` + stealth → 403
 *   - Patchright (stealth fork) + system Chrome → 403
 *
 * All three produced `title: Access Denied` and an `errors.edgesuite.net`
 * reference, the hallmark Akamai edge block. This happens regardless of
 * warmup navigation, cookie jar state, or URL choice.
 *
 * Root cause (high confidence): IP reputation. Testing from a Microsoft
 * corp network after ~8 consecutive probes flagged the egress IP. Fresh
 * residential IPs or an already-trusted session cookie are likely
 * sufficient to unblock, but neither is available to a public OSS CLI
 * out of the box.
 *
 * Viable paths forward, in descending order of OSS-friendliness:
 *   1. Connect to the user's already-running Chrome via CDP
 *      (`--remote-debugging-port`) — real profile, real cookies, real
 *      reputation. Requires user to launch Chrome with the flag once.
 *   2. `launchPersistentContext` against a copy of the user's Chrome
 *      profile directory. Conflicts with running Chrome; awkward UX.
 *   3. Interactive first-run: headed browser, user solves any challenge,
 *      cookies persist to a restaurant-cli-owned profile dir. Slow but
 *      portable.
 *   4. Paid residential proxy — rejected (not OSS-appropriate).
 *
 * Until one of those lands, OpenTable capabilities stay
 * `bookUrl: true` only. This file is kept as scaffolding so the eventual
 * fix is a targeted change to `launch()` rather than a from-scratch
 * build.
 *
 * Safety invariant (inherited from mikehe123/opentable-reservations):
 * this module is READ-ONLY. Nothing in here can complete a booking.
 *
 * Playwright is an *optional peerDependency*: the core CLI works without
 * it. `loadPlaywright()` dynamically imports at runtime so the module
 * stays loadable when Playwright isn't installed.
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
  try {
    return (await import("playwright")) as PlaywrightModule;
  } catch (e) {
    throw new Error(
      "Playwright is not installed. Enable OpenTable live data with:\n" +
        "  npm i -g playwright && npx playwright install chromium\n" +
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

async function launch(
  opts: BrowserFetchOptions = {},
): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const pw = await loadPlaywright();
  const headed = opts.headed ?? process.env["RESTAURANT_CLI_HEADED"] === "1";
  // Prefer the system Chrome channel when available — Akamai is much more
  // forgiving of a real Chrome binary than of Playwright's bundled Chromium.
  // `channel: "chrome"` requires Chrome installed on the system. Fall back
  // to Playwright's Chromium if it isn't.
  const useSystemChrome = process.env["RESTAURANT_CLI_BROWSER_CHANNEL"] !== "chromium";
  const browser = await pw.chromium.launch({
    headless: !headed,
    ...(useSystemChrome ? { channel: "chrome" } : {}),
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });
  const context = await browser.newContext({
    userAgent: REAL_CHROME_UA,
    viewport: { width: 1400, height: 900 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  await context.addInitScript(STEALTH_INIT_SCRIPT);
  const page = await context.newPage();
  page.setDefaultTimeout(opts.timeoutMs ?? 30000);
  return { browser, context, page };
}

async function close(
  handles: { browser: Browser; context: BrowserContext; page: Page },
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
  try {
    await handles.browser.close();
  } catch {
    /* ignore */
  }
}

/**
 * Search OpenTable via the real search page. We navigate to
 * `opentable.com/s?term=<q>` and let the page's React app populate its
 * `__NEXT_DATA__` blob, then extract the embedded search-result JSON
 * from page context. This avoids ever making a direct /dapi/ call that
 * Akamai would 403.
 */
export async function searchViaBrowser(
  query: string,
  _opts: { covers?: number; limit?: number } = {},
  launchOpts: BrowserFetchOptions = {},
): Promise<unknown> {
  const handles = await launch(launchOpts);
  try {
    const url = `https://www.opentable.com/s?term=${encodeURIComponent(query)}`;
    await handles.page.goto(url, { waitUntil: "domcontentloaded" });

    // Wait for the search results script tag to mount. OpenTable's Next.js
    // hydrates search data into window.__NEXT_DATA__. We evaluate a string
    // so we don't need the DOM lib in the Node tsconfig.
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
