/**
 * Browser-driven Tock fetcher — LAUNCH config proven, SCRAPE pipelines TODO.
 *
 * Live probing (2026-05-10) verified the recipe that passes Cloudflare on
 * `www.exploretock.com` for both the public `/<slug>` pages AND the
 * `/api/graphql/<Op>` XHRs the pages fire on the user's behalf:
 *
 *   ✓ patchright (stealth-patched Playwright fork), NOT plain `playwright`
 *   ✓ `chromium.launchPersistentContext(profileDir, { channel: "chrome" })`
 *     (system Chrome binary, persistent profile to accumulate trust cookies)
 *   ✓ `headless: false` — headless trips Cloudflare's challenge JS
 *   ✓ ~5s of mouse-jitter after `goto` so the client-side JS challenge passes
 *   ✓ `--disable-blink-features=AutomationControlled` launch arg
 *
 * With those applied: pages load with the real title, and observed XHRs
 * include the GraphQL ops the frontend fires (FetchBusinessAccolades,
 * SafetyMeasuresForCurrentBusiness, BusinessFaqs, GetTockTen...).
 *
 * Outstanding (next session):
 *   - Capture the search GraphQL operation name + variable shape. Likely
 *     fired by typing into the homepage search input. Mirror OpenTable's
 *     `searchViaBrowser` pattern.
 *   - Capture the availability GraphQL operation name. Tock's reservations
 *     are released on the 15th of each month for the following month, so
 *     availability XHRs fire only when there are slots to render. Probe
 *     during a release window to capture.
 *   - Wire searchViaBrowser + availabilityViaBrowser as auto-mode fallback
 *     in `provider.ts`, mirroring OT's mode switch.
 *
 * Until those land, this module exists to (a) document the launch config so
 * the next attempt starts from a known-good base, (b) demonstrate the
 * pattern, and (c) be importable by future search/availability code without
 * touching client.ts.
 *
 * Safety invariant (same as OT): this module is READ-ONLY. Booking is
 * separately gated behind RESTAURANT_CLI_TOCK_ALLOW_BOOK=1 AND not built
 * yet.
 */

import type { Browser, BrowserContext, Page } from "playwright";

export interface BrowserFetchOptions {
  headed?: boolean;
  timeoutMs?: number;
}

type PlaywrightModule = typeof import("playwright");

async function loadPlaywright(): Promise<PlaywrightModule> {
  try {
    return (await import("patchright" as string)) as PlaywrightModule;
  } catch {
    /* fallthrough */
  }
  try {
    return (await import("playwright")) as PlaywrightModule;
  } catch (e) {
    throw new Error(
      "Neither `patchright` nor `playwright` is installed. For Tock live data, " +
        "install patchright (better stealth):\n" +
        "  npm i -g patchright && npx playwright install chromium\n" +
        `(original error: ${(e as Error).message})`,
    );
  }
}

/**
 * Verified-working Cloudflare-bypass launch config for exploretock.com.
 * Mirrors src/providers/opentable/browser.ts. The profile dir is reused
 * across calls so trust cookies accumulate — do not delete it casually.
 *
 * Override via:
 *   RESTAURANT_CLI_HEADLESS=1         → attempt headless (will likely fail)
 *   RESTAURANT_CLI_TOCK_PROFILE_DIR   → use a different profile dir
 */
export async function launch(
  opts: BrowserFetchOptions = {},
): Promise<{ browser: Browser | null; context: BrowserContext; page: Page }> {
  const pw = await loadPlaywright();
  const useSystemChrome = process.env["RESTAURANT_CLI_BROWSER_CHANNEL"] !== "chromium";
  const profileDir =
    process.env["RESTAURANT_CLI_TOCK_PROFILE_DIR"] ??
    `${process.env["HOME"]}/.cache/restaurant-cli/chrome-profile-tock`;

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

export async function close(handles: {
  browser: Browser | null;
  context: BrowserContext;
  page: Page;
}): Promise<void> {
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
 * Mouse jitter for Cloudflare's client-side JS challenge. ~5s is the
 * minimum verified-working duration; less and the challenge sometimes
 * doesn't release the page.
 */
export async function warmup(page: Page, ms: number = 5000): Promise<void> {
  const start = Date.now();
  let i = 0;
  while (Date.now() - start < ms) {
    await page.mouse.move(100 + i * 50, 200 + ((i * 37) % 400));
    await page.waitForTimeout(400);
    i++;
  }
}

/**
 * Fetch a venue's public Tock page and return the title + captured GraphQL
 * XHRs. Verified to pass Cloudflare. Use this as the scaffolding for
 * search/availability scrapers in a future commit.
 */
export async function fetchVenuePage(
  slug: string,
  launchOpts: BrowserFetchOptions = {},
): Promise<{ title: string; xhrs: { url: string; status: number; body: string }[] }> {
  const handles = await launch(launchOpts);
  try {
    const xhrs: { url: string; status: number; body: string }[] = [];
    handles.page.on("response", async (resp) => {
      const u = resp.url();
      if (!u.includes("exploretock.com/api/")) return;
      const ct = (resp.headers()["content-type"] ?? "").toLowerCase();
      if (!ct.includes("json")) return;
      try {
        const body = await resp.text();
        xhrs.push({ url: u, status: resp.status(), body });
      } catch {
        /* ignore */
      }
    });

    await handles.page.goto(`https://www.exploretock.com/${encodeURIComponent(slug)}`, {
      waitUntil: "domcontentloaded",
    });
    await warmup(handles.page);

    const title = await handles.page.title();
    return { title, xhrs };
  } finally {
    await close(handles);
  }
}
