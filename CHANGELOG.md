# Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- OpenTable provider (`src/providers/opentable/`): search + availability via reverse-engineered `/dapi/` endpoints (no credentials needed). No public OpenTable API exists; this uses the same endpoints opentable.com's React app calls.
- `bookUrl` capability on `ProviderCapabilities` — honest degradation for providers that can generate a deep link but not complete the booking themselves.
- `Provider.getBookingUrl` optional method.
- OpenTable hand-off deep links: each availability Slot carries a pre-filled `opentable.com/booking/...` URL as its `token`. User completes the booking in their own browser; the CLI never clicks Confirm. Safety invariant borrowed from mikehe123/opentable-reservations.
- `agents/opentable-agent.md` for the Claude Code plugin.
- 8 new tests (search, availability, deep-link builder, registry capability probes).

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
