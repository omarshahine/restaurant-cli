# Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.1.18] — 2026-05-11

### Fixed
- **Resy search HTTP 400 on `--city`** (#29): Resy's
  `/3/venuesearch/search` gateway tightened input validation and now rejects
  the `location` body field with `{"message":"Invalid data received.",
  "data":{"location":["Unknown field."]}}`. The field is dropped from the
  request; city filtering is applied client-side against each hit's
  `location.code` (which Resy still returns), matching the working Go-port
  behavior the issue cites. When a city filter is active, the upstream
  `per_page` is over-fetched to 50 so the caller's `--limit` is honored
  after the client-side filter rather than capped before it.

## [0.1.17] — 2026-05-11

### Added
- **Tock live search + availability** via shell-out to the
  [`table-reservation-goat-pp-cli`](https://github.com/mvanhorn/printing-press-library)
  Go binary (Apache-2.0). Tock anonymous reads need both a Chrome TLS
  fingerprint (Cloudflare) and a page-issued `x-tock-session` token, neither
  of which has a clean pure-Node path. The trg binary handles both; we wrap
  it. Install with: `npx -y @mvanhorn/printing-press install table-reservation-goat`
  (writes `~/go/bin/table-reservation-goat-pp-cli`). Override path via
  `RESTAURANT_CLI_TRG_BIN`.
- `src/providers/tock/trg.ts`: typed wrapper around
  `restaurants list --network tock --query`, `availability check`, and
  `availability multi-day`. Maps exit code 3 (not_found) and 0/nonzero
  surfaces to typed errors.
- `restaurant doctor` validates Tock by checking the binary is on disk; helpful
  install hint when missing.

### Changed
- Tock capabilities flipped to honest-true for `search` and `availability`;
  `book`, `cancel`, `list` remain false (book stays gated behind
  `RESTAURANT_CLI_TOCK_ALLOW_BOOK=1` AND not built; list/cancel still need
  session-cookie wiring). Cookie import path
  `restaurant auth login tock --from-file` unchanged.
- Removed `RESTAURANT_CLI_TOCK_MODE` env var (replaced by the binary's own
  data-source flags). Added `RESTAURANT_CLI_TRG_BIN` to the
  `agent-context` env-floor list.

### Removed
- Stub Tock client/transport/protobuf/SSR/bootstrap modules from 0.1.16.
  They were a partial native port that hit Cloudflare + session-token walls
  and never went live; the trg shell-out replaces them. The architectural
  notes survive in this CHANGELOG entry + provider.ts comments for the
  future native-port attempt.

## [0.1.16] — 2026-05-10

### Added
- **Agent mode** (`--agent`) rolls up `--json --compact --no-color --no-input --yes` into one flag. Honored by every command. Env floors `RESTAURANT_CLI_AGENT=1` and `RESTAURANT_CLI_DRY_RUN=1` override flags.
- Shared output emitter (`src/cli/output.ts`) — single `emit()` centralizing JSON/CSV/compact/select rendering. Replaces 11 hand-rolled `console.log`/`JSON.stringify` blocks across commands.
- `--csv` output mode for table/array results.
- `--select id,name,time` field projection with dotted-path support.
- `--dry-run` on `book`/`cancel`/`snipe` — prints the would-fire envelope without calling the provider.
- `--idempotent` on `book` — pre-flights `listReservations()` and returns an existing live match instead of double-booking. Filters out cancelled/expired/refunded/no-show statuses (snipe fire-time path now passes `--idempotent` automatically). 6 dedicated tests for the live-status filter.
- `restaurant agent-context` — self-describing JSON manifest of every command, flag, provider capability, env-var floor, and exit code. Lets agents learn the surface in one call.
- `restaurant auth login tock --from-file <chrome-cookies>` — file-based Chrome cookie import (macOS Keychain intentionally avoided). Persists `TOCK_SESSION_COOKIES` to `~/.secrets.env`. Accepts plain `Cookie:` strings or DevTools-JSON exports.
- `restaurant auth status` — shows which providers have session cookies stored vs. loaded.
- `restaurant earliest <venue,venue,...> --within 14d` — cross-network soonest-slot scan. Per-venue parallel walk forward day-by-day across every availability-capable provider; one row per venue.
- Multi-provider `search` fan-out: by default searches every provider with `capabilities.search` and merges/ranks results. `--provider <id>` scopes to one (legacy behavior).
- Formalized exit code table: 0 (success), 2 (usage), 3 (not_found), 5 (api), 6 (auth), 7 (rate_limited), 10 (config). New error classes: `NotFoundError`, `RateLimitError`, `UsageError`. Tock client maps HTTP 404→3 and 429→7 explicitly.
- `restaurant doctor --fail-on stale|error` for CI gating.
- Tock provider scaffold (`src/providers/tock/`) — full module layout (provider, client, auth, search, availability, list, cancel, book, schemas, env, browser, index) ready for live wiring. Capabilities currently honest-false; see "Tock specifics" in README.
- Single-source-of-truth version constant in `src/core/version.ts` reading from `package.json` at runtime — replaces three independent `VERSION` constants previously duplicated in `version.ts`, `doctor.ts`, and `agent-context.ts`.
- Scheduler at-job env allowlist extended for `TOCK_SESSION_COOKIES`, `TOCK_CVC`, `OPENTABLE_SESSION_COOKIES`.
- 28+ new tests covering output emitter, agent flag parsing, Tock parsers, earliest scanner, cookie blob normalization, book live-status filter, version single-source.

### Changed
- `search` and `earliest` now emit an envelope `{ ok, results, failures }` in `--json`/`--csv` mode so agent callers can distinguish empty-results from blocked-by-Cloudflare. Previously per-provider failures were visible only in human mode.
- Tock client documents the verified-real surface (`/api/graphql/<OperationName>` GraphQL, not the `/api/consumer/v2/...` REST shape originally guessed). Search/availability/list/cancel currently throw typed `tock_*_unverified` errors pending real GraphQL operation names + a working transport (cookies or browser).
- Patchright browser launch config for Tock (`src/providers/tock/browser.ts`) verified live: persistent profile + `channel: "chrome"` + headed + 5s mouse jitter passes Cloudflare for both pages and `/api/graphql/*` XHRs. Search/availability XHR-capture pipelines TODO.

### Fixed
- `--compact` projection no longer over-strips single-object envelopes; only row-shaped (array) data is projected. Single `book` results and `version` envelopes keep their full shape.

### Earlier Unreleased entries (carried forward)
- SecretRef resolver now supports `source: "file"` + `provider: "secrets"`, reading `~/.openclaw/secrets.json` and following `id` as an RFC 6901 JSON pointer. This is the idiomatic OpenClaw shared-secrets-store pattern (used by travel-hub, easypost, etc.) — lets one copy of a token live in the central secrets file rather than inline in each plugin's config. Previously the resolver understood `env` and filesystem-path `file` only; the shared-store shape silently returned `undefined`, causing 401s on booking calls. 7 new tests covering the shape, JSON-pointer escapes, missing-file / missing-pointer / non-string-value fallbacks.
- OpenTable provider (`src/providers/opentable/`): search + availability via reverse-engineered `/dapi/` endpoints (no credentials needed). No public OpenTable API exists; this uses the same endpoints opentable.com's React app calls.
- `bookUrl` capability on `ProviderCapabilities` — honest degradation for providers that can generate a deep link but not complete the booking themselves.
- `Provider.getBookingUrl` optional method.
- OpenTable hand-off deep links: each availability Slot carries a pre-filled `opentable.com/booking/...` URL as its `token`. User completes the booking in their own browser; the CLI never clicks Confirm. Safety invariant borrowed from mikehe123/opentable-reservations.
- `agents/opentable-agent.md` for the Claude Code plugin.
- 8 new tests (search, availability, deep-link builder, registry capability probes).

### Changed
- `restaurant_search` and `restaurant_availability` tool descriptions now spell out per-provider capability differences (Resy = full booking, OpenTable = search/availability/deep-link only, Tock/SevenRooms unsupported) and point at the `restaurant` skill for the live capability matrix. Surfaces this guidance in the model's tool list rather than only in the skill body, so the right provider gets picked without first reading the skill.

### Fixed
- `restaurant doctor` now honestly validates auth for anonymous providers (pre-existing bug surfaced by OpenTable).

## [0.1.0] — 2026-04-16

### Added
- Initial scaffold with pluggable provider architecture.
- Provider interface (`src/providers/types.ts`) + runtime registry.
- Resy provider module (`src/providers/resy/`) — search only in M1.
- CLI surface (`restaurant setup`, `restaurant search`, `restaurant doctor`, `restaurant version`).
- Config loader (`~/.config/restaurant-cli/config.yaml`) with SecretRef resolution.
- Scheduler interface with POSIX `at` backend skeleton (execution wiring in M3).
- OpenClaw plugin shell (`src/integrations/openclaw/`).
- Claude Code plugin shell (`.claude-plugin/`, `skills/`, `agents/`, `commands/`).
- CI: typecheck + test + lint on push.
