# Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

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
