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
