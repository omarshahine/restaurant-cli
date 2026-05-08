# Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
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
