# Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.1.27] — 2026-06-24

### Security — opt-in gates for the highest-risk capabilities
The higher-risk capability groups are now **off by default** and fail closed
with an actionable, consent-oriented message until the user explicitly opts in.
No features are removed — they're disabled-by-default behind an env flag.

- **Scheduled sniping requires `RESTAURANT_CLI_ENABLE_SNIPE=1`.** Snipe is an
  *unattended* booking (fires later, loads the token at run time, books with no
  further confirmation), so `restaurant snipe` / `restaurant_schedule_snipe`
  now refuse to queue unless the flag is set. `snipe --dry-run` still previews
  without it.
- **OpenTable + Tock live-site automation requires `RESTAURANT_CLI_ENABLE_SITE_AUTOMATION=1`.**
  Their `search`/`availability` paths drive a live site with no official API
  (scraping / anti-bot bypass, possible ToS violation), so they're gated at the
  provider boundary. Resy (documented-token API) and OpenTable `bookUrl`
  hand-off are **not** gated.
- New `core/gates.ts` centralizes the opt-in contract (`requireSnipeEnabled`,
  `requireSiteAutomationEnabled`); +6 gate tests and a provider-gating test.
- Documented the flags in README, SKILL, the snipe command, and the
  OpenTable/Resy agents (agents are told to relay the opt-in to the user, never
  set it themselves).

## [0.1.26] — 2026-06-23

### Security — env-first credentials (the CLI writes no secret file)
The 0.1.25 re-audit's remaining High "Credential Access" findings were all
about the CLI writing tokens to `~/.secrets.env`. The tool now persists **no
plaintext credential file of its own** — it is env-first.

- **`restaurant setup` no longer writes `~/.secrets.env`.** It saves an env
  `tokenRef` in `config.yaml` and prints an `export <PROVIDER>_AUTH_TOKEN='…'`
  line (to stderr, once) for you to add to your own environment. The value is
  resolved from the environment at runtime.
- **`restaurant auth login` (session cookies) is env-first too** — it prints an
  `export <PROVIDER>_SESSION_COOKIES='…'` line instead of writing the file;
  `auth status` now reports presence from the environment, not a file.
- Removed the now-unused `appendSecret` / `secretKeyPresent` writers from
  `core/secrets.ts`. Replaced `warnPlaintextCredentialStorage` with
  `instructEnvSecret` (the export-line helper). The snipe `at` wrapper still
  *sources* your env file at fire time — you provide it; the plugin never
  writes it.
- Updated README / SKILL / setup docs to describe the env-first model.
- Net effect: combined with 0.1.25 (no `~/.openclaw/secrets.json`), the plugin
  writes zero plaintext credential stores. Whatever env file you choose to hold
  the token is yours to manage (for this maintainer it's a chezmoi+age
  encrypted-at-rest source).

## [0.1.25] — 2026-06-23

### Security — eliminate the OpenClaw plaintext secret store
The v0.1.24 re-audit kept flagging plaintext credential storage High. The
OpenClaw mirror was the main offender: it wrote each token into
`~/.openclaw/secrets.json` and stored a file-backed SecretRef
(`{source:"file", provider:"secrets"}`) pointing at that plaintext store. That
store is now eliminated.

- **OpenClaw mirror now persists environment SecretRefs.** Sensitive values are
  no longer written to disk by the mirror. `plugins.entries.restaurant-cli.config`
  holds `{source:"env", id:"RESY_AUTH_TOKEN"}` refs that resolve at runtime from
  the gateway environment — exactly the env vars the manifest already declares
  under `metadata.openclaw.requires.env`. **The plugin writes no secret store of
  its own; `~/.openclaw/secrets.json` is never created.**
- Removed the now-unused plaintext writer/reader (`setOpenClawSecret`,
  `readOpenClawSecret`). `resolveSecret` keeps the `provider:"secrets"` read
  path so **legacy installs** carrying a file-ref still resolve.
- Updated the plaintext-storage disclosure (`warnPlaintextCredentialStorage`)
  and README to state the OpenClaw path stores no secret of its own.
- Standalone CLI behavior is unchanged: it still reads `~/.secrets.env` +
  `config.yaml`. Added an end-to-end test that the env-ref resolves from the
  gateway env and no `secrets.json` is written.

## [0.1.24] — 2026-06-23

### Security / defense-in-depth
Hardening pass on the destructive code paths the ClawHub v0.1.23 re-audit
flagged High. Removes no features — the booking, cancellation, snipe, and
provider behaviors are unchanged; these add in-code guardrails so a miswired,
buggy, or injected caller fails closed.

- **Scheduler command validation.** `AtScheduler.schedule()` now rejects any
  `job.command` containing an unquoted shell control/substitution operator
  (`; & | < > \` $ ( )`), a newline, or an unterminated quote, via
  `assertShellSafeCommand`. The legitimate producer (`snipe.ts`) emits a
  single fully-`shellQuote`d `restaurant book …` invocation, so valid commands
  pass untouched; an attempt to smuggle command chaining/substitution into the
  deferred `at` job is refused before it is ever written to the wrapper.
- **Hard in-code confirmation gate on book/cancel.** `BookRequest.confirmed`
  and `cancel(…, { confirmed })` must be explicitly `true`; the Resy provider
  (the only path that mutates a real account) throws otherwise. The CLI stamps
  the flag only after its y/N prompt (or `--yes`); the OpenClaw tools stamp it
  to honor their documented "confirm before invoking" contract. A destructive
  call that omits it now fails closed instead of silently booking/cancelling.
- Added guard tests for all three new refusals.

## [0.1.23] — 2026-06-23

### Security / transparency
Clears the remaining honestly-fixable findings from the ClawHub v0.1.22 audit.
(Structural findings — anti-bot automation for OpenTable/Tock, DevTools token
extraction for Resy which has no public OAuth, and live state-changing bookings
— are intentional product behavior and left intact.)

- **Removed personal-credential disclosure.** The Resy agent no longer names a
  specific operator's durable auth token or its on-disk location, and no longer
  implies a stored token may be used as fallback auth. It now instructs the
  agent to never read/inject/guess credentials and to always defer to the
  interactive `restaurant setup resy` flow, which uses the current user's own
  account. (Audit's highest-confidence cluster — flagged 4×.)
- **Default-deny secret classification in `setup`.** `persist()` now decides
  what may be written to plaintext `config.yaml` from each provider's declared
  `sensitive`/`ephemeral` flags rather than a fixed two-key denylist; an
  unrecognized sensitive field is skipped with a warning, never written.
- **Tightened skill trigger.** Dropped the over-broad "search for dinner"
  phrase and added an explicit "don't trigger on generic dining chit-chat"
  guard, so the skill activates only on real reservation intent.
- **Unattended-booking warning in the snipe command doc** so the agent flags
  deferred credential access when queuing a snipe.

## [0.1.22] — 2026-06-11

### Security / transparency
Addresses the remaining honestly-fixable ClawHub security-audit findings —
the "missing user warnings", token-exposure, and intent-divergence clusters —
by making the tool's behavior explicit rather than silent. (Findings that are
intentional by design — plaintext-by-no-Keychain-rule, and live-site browser
automation for OpenTable/Tock which have no official API — are now *disclosed*
rather than removed.)

- **Plaintext credential disclosure.** `setup`, `auth login`, and `snipe` now
  print a one-time notice (to stderr, never polluting `--json`) explaining that
  a long-lived bearer token/cookie is stored in plaintext, before it is written.
- **Unattended-booking warning.** `snipe` warns that the scheduled job loads
  your token and runs `book --yes` with no further confirmation at fire time.
- **Browser-automation / ToS disclosure.** The OpenTable (patchright) and Tock
  (TLS-impersonating binary) paths print a one-time notice that there is no
  official API, the tool drives the live site, and this may be against the
  site's Terms of Service.
- **`restaurant config` masks secrets** by default (token/secret/password/
  cookie/apiKey/auth values → `***redacted***`); pass `--show-secrets` for the
  raw values. SecretRef `tokenRef` pointers are preserved (they hold no value).
- **Doc accuracy.** Trimmed the OpenTable browser module's step-by-step anti-bot
  "recipe / next-session playbook" comments to a factual description; corrected
  the plugin manifest description (Tock/OpenTable are read-only, not "stubbed");
  de-personalized credential-location comments.
- New `core/warnings.ts` module; tests for redaction + warnings (166 total).

## [0.1.21] — 2026-06-11

### Security
- **OpenClaw mirror no longer inlines secrets into `openclaw.json`.** When you
  run `restaurant setup <provider>-openclaw`, sensitive values (auth tokens,
  session cookies) are now written **once** into the OpenClaw shared secret
  store (`~/.openclaw/secrets.json`) and the plugin config holds only a
  `{source:"file", provider:"secrets", id:"/restaurant-cli/<key>"}` SecretRef —
  the same pattern the parcel and travel-hub plugins use. Previously the raw
  token value was copied inline into `~/.openclaw/openclaw.json`. Non-secret
  fields (the public Resy `apiKey`, email) stay inline. This addresses the
  ClawHub security-audit findings about credential replication across config
  files.
- **No more secret-bearing backups.** The mirror previously wrote a timestamped
  `openclaw.json.bak.restaurant-*` copy on every change, leaving plaintext
  tokens on disk indefinitely. Those backups are no longer created, and any
  left by older versions are purged on the next mirror.
- **Standalone CLI is unchanged** — it still reads `~/.secrets.env` +
  `config.yaml` and never touches the shared store. No regression for non-OpenClaw use.

### Added
- `setOpenClawSecret` / `readOpenClawSecret` helpers in `core/secrets.ts` for
  the shared store, plus `provider` on the `SecretRef` config-schema branches.
  Round-trip and routing covered by new tests (159 total).

## [0.1.20] — 2026-06-11

### Security
- **Scheduled-job secret import no longer uses `eval`**: the `at` wrapper
  built by the snipe scheduler previously ran
  `eval "$(grep '^export …' ~/.secrets.env)"` to load provider tokens at
  fire time. A token value containing `$(…)`/backtick command substitution
  (e.g. from a tampered secrets file) would have executed. The importer now
  parses each `export KEY=VALUE` line with a literal `read` + assignment, so
  values are stored verbatim and never re-evaluated by the shell. Allowlist
  filtering (only provider tokens, never unrelated secrets) is preserved and
  now covered by a regression test that fires a hostile payload through the
  importer and asserts nothing executes.

### Fixed
- **Misleading "stubbed for now" doc comments** on `ResyClient.getAvailability`
  and `ResyClient.cancel`. Both are fully live calls — `getAvailability` is a
  read-only `GET /4/find`, and `cancel` is a live, destructive `POST /3/cancel`
  gated behind the provider capability flag and the CLI confirmation prompt.
  Comments now describe the real behavior instead of claiming the methods are
  unimplemented.

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
