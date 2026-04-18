# Worklog

## 2026-04-16

- Scaffolded restaurant-cli repo with TypeScript/Node 20+ stack.
- Established the pluggable provider architecture (interface + registry + bootstrap) as the project backbone. Resy is the first provider module; OpenTable, Tock, SevenRooms will join as equal peers.
- Decision: TypeScript over Go. Rationale: OpenClaw SDK is TS-native, same codebase can power CLI + OpenClaw plugin without shelling out between them. Cost is a ~2k LOC reimplementation of resy-cli's logic; worth it for single-source-of-truth across four consumer surfaces (CLI, library, OpenClaw, Claude Code).
- Decision: No macOS Keychain. Auth tokens live in `~/.secrets.env` + SecretRef references in config. Matches the user's global secrets policy.
- Decision: POSIX `at` as default scheduler backend. Daemon backend deferred.
- Attribution: design-only inspiration from lgrees/resy-cli (MIT). NOTICE + README credit; endpoint-level citations inline.
- M1 scope: setup + search + doctor + version. Other commands stubbed to report "not implemented yet".
- Open: publish to npm, GitHub, ClawHub, and omarshahine-plugins marketplace — pending user approval of initial commit.

### Session 2 — OpenTable prototype (M6 early)

- Investigated OpenTable API reality across 8+ active 2026 repos (jallenschuler/restaurant-butler, gabehassan/noresi, mikehe123/opentable-reservations, yhyatt/ClawCierge, rajksarkar/reservation-agent, bzeng68/res-bot, duaragha/opentable-mcp).
- Confirmed: OpenTable public API (restref/api, heroku, affiliate) is dead. The `/dapi/` endpoints the opentable.com React app uses DO work anonymously for read. Booking completion requires browser automation.
- Decision: three-layer module — (1) HTTP `/dapi/` for search + availability, (2) URL builder for zero-maintenance deep-link hand-off, (3) browser-use for book, deferred behind an opt-in flag (not shipped yet).
- Safety invariant: **never auto-submit a booking.** Borrowed from mikehe123/opentable-reservations — agents that automate the full OT flow have been observed confirming real reservations by accident. The CLI stops at the deep link.
- Pluggable seam proved: `git diff --stat HEAD -- src/cli src/core src/scheduler src/integrations` returned empty after adding OpenTable. The only changes outside `src/providers/opentable/` were: one line in `bootstrap.ts`, two additions to `types.ts` (new `bookUrl` capability + optional `getBookingUrl` method).
- Fixed latent bug in `doctor.ts` that OpenTable exposed: doctor skipped anonymous providers instead of running `auth.validate()`.
- 19 tests passing (11 from M1 + 8 new for OpenTable). `restaurant doctor` now shows both providers with honest capabilities.
- Open: (a) decide whether to prototype the M6 browser-book path next or return to M2 (Resy book) first, (b) live smoke test the `/dapi/` path against real OpenTable IDs, (c) push + publish (still held).

## 2026-04-17

- Replaced the DevTools-scavenger-hunt setup flow with email+password login. `restaurant setup resy` now prompts for email + password (hidden echo via `@inquirer/password`), calls `POST /3/auth/password`, and persists the returned JWT to `~/.secrets.env` as `RESY_AUTH_TOKEN` plus a config block that references it via `tokenRef`.
- Extended the Provider seam with `auth.login?(creds)` and `SetupPrompt.ephemeral`. Ephemeral prompt answers (like passwords) are consumed by `login()` and never persisted. The CLI's `setup` command is now provider-agnostic — any future provider that implements `login()` gets the one-command flow for free.
- `RESY_PUBLIC_API_KEY` is a plain constant in code and plaintext in `config.yaml` — it's Resy's shared frontend key, not a per-user secret.
- Cleaned up latent bugs in `search.ts` and `doctor.ts` that required `RESY_API_KEY` env var (no longer needed now that the public key lives in code/config).
- Fixed Resy venue URL construction to use the nested `location.code` + top-level `url_slug` — now produces `https://resy.com/cities/ny/carbone` instead of the double-slashed path.
- **Verified live end-to-end**: setup → login → config persisted → `restaurant doctor` reports `resy auth: ok (Omar)` → `restaurant search "le bernardin"` returns real Resy venues (id 1387 for Le Bernardin, id 6194 for Carbone). First confirmed live provider query.
- 23 tests passing (+2 for login parse/error path). Typecheck + build clean.
- Open: (a) commit login-flow work to git, (b) decide whether to proceed to M2 (availability + book + cancel + list) or return to push / publish / OpenTable browser path.

### Session 3 — push + OpenTable browser attempt

- Pushed 4 commits to https://github.com/omarshahine/restaurant-cli (public, MIT).
- Attempted OpenTable browser-driven read path to defeat Akamai. Tried three configurations live:
  1. Playwright bundled Chromium (headless) → 403 Akamai edge block
  2. Playwright `channel: "chrome"` + stealth init script → 403
  3. Patchright (stealth fork) + system Chrome → 403
- All three produced `title: Access Denied` with an `errors.edgesuite.net` reference. Confirmed via direct Playwright probes that homepage warmup + session delay don't help either.
- Root cause (high confidence): IP reputation. ~8 probes from this Microsoft corp network flagged the egress IP at Akamai's edge. Not a defeatable-via-code problem from an OSS CLI.
- Decision: **keep OpenTable capabilities as `bookUrl: true` only.** Browser scaffold (src/providers/opentable/browser.ts) stays in the repo as staging ground for a future attempt via one of: (a) CDP connection to user's already-running Chrome, (b) launchPersistentContext on a profile copy, (c) interactive first-run with user in the loop.
- Dependencies added (both as optional peerDeps — don't bloat core install): `playwright` ^1.59.1, `patchright` ^1.59.4.
- Open: (a) M2 (Resy availability + book + cancel + list), (b) publish to npm + ClawHub + omarshahine-plugins marketplace, (c) CDP-to-real-Chrome approach for OpenTable when we're ready to try again from a residential IP.

### Session 4 — OpenTable browser access cracked, scraping still TODO

- Reopened the OpenTable browser path after establishing that Omar's real Chrome loads opentable.com fine (so the IP isn't fully blocked, just flagged against automation signatures).
- Live-verified that **patchright** (stealth-patched Playwright fork) + `chromium.launchPersistentContext(profileDir, { channel: "chrome" })` + `headless: false` + ~4.5s of mouse jitter after navigation DEFEATS Akamai on opentable.com. Plain Playwright, patchright without a persistent profile, and channel-less invocations all fail with `title: Access Denied`.
- Captured real GraphQL responses: `Autocomplete` (11KB, 30 results), `LocationPicker` (38KB), `RestaurantsAvailability` (66 bytes with our search term — empty, because `/s?term=X` expects a location+time). The page is reaching the real backend.
- **What's still TODO**: turning access into deterministic search. Two sub-problems unresolved: (i) calling `/dapi/fe/gql` from within `page.evaluate` returns 403 (missing CSRF or persisted-query-hash headers), (ii) `locator.type()` into the searchbox times out (likely overlay or focus issue not yet debugged). Next attempt: either debug the typing path or scrape rendered DOM on `/r/<slug>` restaurant profile pages.
- Updated `src/providers/opentable/browser.ts` with the verified-working launch/stealth config so the next session starts from a known-good base. Capabilities intentionally still `bookUrl: true` only — no pretending we can do search yet.
- Committed: `ba406ec` (initial scaffold) → revised in-place on same branch.

### Session 5 — OpenTable search goes live

- Debugged why `locator.type()` timed out: OneTrust cookie consent banner was covering the page. Solution: programmatically click `onetrust-accept-btn-handler` / `accept-recommended-btn-handler` via `page.evaluate` before interacting.
- Found that JS `value` setter + `input` event dispatch does NOT update React's internal `_valueTracker` — autocomplete fired but with a stale / generic term. Solution: `page.keyboard.type()` after JS-focusing the input dispatches real keyboard events that React honors.
- End-to-end verified: `restaurant search "carbone" --provider opentable` returns 5 real OpenTable venues (Carbone Dallas, Carbone VINO Dallas/Coconut Grove, two Juarez ones). Search seam works.
- Results are geo-biased by the persistent profile's last-known location (Cabo today, because our warmup landed there). Polish item: add a `--city` flag path that clicks the location picker first. Not blocking.
- `capabilities.search` flipped to `true` for OpenTable. `availability/book/cancel/list/snipe` still `false` — different interaction flows needed.
- Tests: 25 passing (+3 for `parseAutocompleteResponse`). Typecheck + build clean.
- Open: (a) location targeting polish, (b) availability via `/r/<slug>` DOM scrape, (c) M2 Resy book/cancel/list/snipe.

### Session 6 — M2 Resy: availability + book + cancel + list

- Closed issues #5, #6, #7, #8. All four commands live and capability-flipped on Resy.
- **Availability (#5)**: `/4/find` parser extracted into `parseAvailabilityResponse` for testability. Slot.token carries Resy's `rgs://resy/<venueId>/...` config token that flows straight into book. Live-verified against Le Bernardin (id 1387) on 2026-05-15 — returned two real slots (22:45, 23:00 Dining Room).
- **Book (#6)**: two-step flow (`POST /3/details` → `POST /3/book`). Pulls `book_token` + picks default payment method from the details response. If no `slotToken` is passed, command falls back to `getAvailability` and matches by `time`. CLI `book` command requires y/N confirmation; `--yes` skips. 6 mocked tests covering success, time-match fallback, no-match, expired-slot, no-payment-method, and Resy error body.
- **Cancel (#7)**: `POST /3/cancel` with `resy_token` body. Accepts both `{cancelled: true}` and `{cancel_token}` response shapes as success. CLI gate + `--yes` mirror book.
- **List (#8)**: split out of `cancel.ts` into `list.ts`. **Shape discovery**: the real Resy `/3/user/reservations` response diverged significantly from what the legacy resy-cli snapshots suggested. `venue` carries only `{id, currency}` (no name), `time_slot` is a bare `"HH:MM:SS"` string, and status is `{finished, no_show}` not `{reservation}`. Wrote `extractVenueNameFromShare` to regex the venue name out of `share.generic_message` ("Please RSVP for X on…") and `share.message[*].title` ("RSVP for our Reservation at X"). Live-verified: 20 real historical reservations display cleanly with venue names (Nishino, Cena Ristorante, Snake River Grill, Le Bernardin, etc.). Legacy shape still tolerated for forward compatibility.
- Refactors: hoisted duplicated `credentialsFor` helper to `src/cli/credentials.ts`; extracted `confirmTTY` prompt to `src/cli/prompts.ts` so book + cancel share one y/N implementation.
- Tests: 48 passing (was 25; +23 for M2 features). Typecheck + build clean.
- Live-tested end-to-end: doctor ok, availability returns real slots, list returns real 20-row history. Book/cancel verified against nock only — destructive calls left to the user to run manually with `--yes`.
- Open: (a) issues #9/#10 (M3 snipe + jobs), (b) publishing wave (#1 npm, #2 ClawHub, #14 private marketplace), (c) OpenTable polish (#3 availability, #4 geo).

## 2026-04-18

### Session 7 — First live Resy booking + API drift discovery

- **First real booking completed end-to-end**: The Butcher's Table (Seattle, venue 562), 2026-04-25 19:00, Upstairs Lounge, party of 2. `reservation_id: 864504765`. Confirmed visible in `restaurant list --upcoming`.
- **Resy API has drifted since resy-cli's upstream**. The book flow's two endpoints now disagree about Content-Type:
  - `POST /3/details` migrated to JSON. Form-encoded → 415 "Did not attempt to load JSON data". Query-string params → 400 "invalid configuration ID" even with a valid token. Only `Content-Type: application/json` + params in the JSON body works.
  - `POST /3/book` is STILL form-encoded. JSON body → 400 "invalid book token" even when the token is valid and fresh. `application/x-www-form-urlencoded` with `struct_payment_method` as a stringified JSON object succeeds.
- The mismatch is what consumed this session. Empirically verified by firing both shapes against the live API; each endpoint's client method now carries a comment documenting what works and what doesn't, so the next drift can be debugged from the code alone.
- Tests: all 48 still pass (nock body regexes switched back to form-encoded matcher on `/3/book`, JSON-object matcher on `/3/details`).
- Open: (a) whether `/3/cancel` has drifted too (haven't exercised live; form-encoded matches the older shape so likely fine), (b) same commit-push-close-issues gate as before.

### Session 8 — M3 through M6 in one PR (autonomous overnight)

Four milestones shipped on branch `m3-through-m6`, one PR back to main.

- **M3 (#9, #10) — Resy snipe + jobs, live-verified**
  - `scheduler/at.ts` now actually pipes to POSIX `at -t YYYYMMDDHHMM`. Chose `-t` over `at 10:00 04/30/2026` because `-t` takes a literal stamp and never does heuristic parsing. Wraps the command in a bash script that sources `~/.secrets.env` + `~/.secrets-macbook-pro.env` at fire time because `at` strips the parent shell's env.
  - Captures the at-job number from `at`'s stderr and persists it alongside the metadata so `restaurant jobs cancel` can call `atrm` without asking `atq`. JSONL `snipe.start` / `snipe.end` events + book output go to `~/.local/state/restaurant-cli/logs/<jobId>.log` for `jobs logs`.
  - Dependency injection on enqueue + cancelAt so tests don't touch the real at-queue.
  - `jobs` command converted to citty subCommands (list / cancel / logs). Dropped the parent `run` handler because citty dispatches parent `run` as a pre-hook and would double-print every subcommand call.
  - Live-verified end-to-end with a 2026-12-01 snipe: `atq` showed the job, `restaurant jobs list` surfaced it with the at-job id, `restaurant jobs cancel --yes` called `atrm` and cleared both queues.

- **M4 (#11) — OpenClaw tool handlers**
  - 6 tools wired: `restaurant_search`, `restaurant_availability`, `restaurant_book`, `restaurant_schedule_snipe`, `restaurant_list`, `restaurant_cancel`. All provider-agnostic via `provider` param + registry dispatch.
  - `restaurant_book` on OpenTable gracefully degrades to `bookUrl` hand-off. The tool never pretends to book when the provider can't.
  - Safety documented in tool descriptions: book/cancel are destructive — the OpenClaw client is expected to confirm with the user; the plugin itself does not prompt.
  - `adapter.ts` is the loadable entry point: top-level `await import("openclaw/...")` with a graceful fallback that default-exports `null` + a warning if the peer dep is missing. Keeps library consumers working.
  - credsFor uses a `{providerId}_{key}` prefix convention against pluginConfig (not tied to setupPrompts, because the durable Resy auth token lives outside of prompts). Tests verify the round-trip.

- **M5 (#12, #14) — Claude Code plugin + private marketplace**
  - Skill, three agents (`restaurant-router`, `resy-agent`, `opentable-agent`), five commands. All command frontmatter is description-only — `name:` breaks `/plugin-prefix:` autocomplete per the omarshahine-plugins CLAUDE.md.
  - Router's protocol: `restaurant doctor` first, never assume capabilities, never pass `--yes` unless the user confirmed in chat. OpenTable + book → graceful hand-off via `opentable-agent`.
  - Registered in `omarshahine-plugins/.claude-plugin/marketplace.json` as `{source: github, repo: omarshahine/restaurant-cli}` (same pattern as `apple-pim`). Marketplace metadata bumped 3.38.1 → 3.39.0. That change is committed + pushed to the private marketplace repo separately.

- **M6 (#13) — OpenTable availability scraper (wired, NOT live-verified)**
  - New `parseNextDataAvailabilityResponse` in `availability.ts` walks OpenTable's `__NEXT_DATA__` hydration blob. Tries 5 candidate anchor paths (`initialData.availabilityData.availability.times`, `restaurantAvailability.times`, etc.) then BFS fallback for schema drift. Drops `available: false` + `isSoldOut: true`. Emits Slot[] with bookingUrl tokens.
  - `provider.getAvailability` wires straight to `availabilityViaBrowser` → parser. **Capability stays `false`** so the CLI gate blocks invocation until a live run confirms the parser matches OpenTable's current SSR payload. Flipping after verification is a one-character change in `provider.ts`.
  - Tests cover the primary path, fallback path, BFS last-resort, graceful empty, and available-filter. 6 new tests, 61/61 passing.

Tests: 50 → 61 (+11 for M3 scheduler + M4 OpenClaw tools + M6 NEXT_DATA parser). Typecheck + build clean.

Live-verified this session: doctor, snipe queue+list+cancel (end-to-end).
Not live-verified: anything destructive (no second Resy booking), OpenTable availability (needs the user in the loop for Akamai warmup).

Open: (a) merge the PR on `m3-through-m6`, (b) flip OpenTable availability capability once you run it live, (c) publishing wave (npm #1, ClawHub #2).
