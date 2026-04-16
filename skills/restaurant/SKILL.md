---
name: restaurant
description: |
  Book restaurant reservations via the `restaurant` CLI (backed by Resy, OpenTable, Tock, and other pluggable providers). Use when:
  - User asks to book, search, or manage a restaurant reservation
  - User mentions "Resy", "OpenTable", "Tock", or "SevenRooms"
  - User mentions a restaurant name and a date/time
  - User says "snipe that reservation" or mentions a release-time booking
  - User wants to list or cancel upcoming dining reservations
---

# restaurant

The `restaurant` CLI is installed as `restaurant-cli` on npm. It wraps multiple reservation platforms behind a single command surface.

## Quick reference

```bash
restaurant setup resy               # one-time credential setup per provider
restaurant search "le bernardin"    # venue search (defaults to configured provider)
restaurant search "le bernardin" --provider opentable   # cross-provider
restaurant doctor                   # verify config + auth + scheduler health
# M2+:
restaurant availability --venue <id> --date 2026-05-01 --party 2
restaurant book --venue <id> --date 2026-05-01 --time 19:30 --party 2
restaurant snipe --venue <id> --date 2026-05-01 --time 19:30 --party 2 \
                 --release-at 2026-04-30T10:00-04:00
restaurant list
restaurant cancel <reservation-id>
```

## Configuration

- Config: `~/.config/restaurant-cli/config.yaml`
- Secrets: `~/.secrets.env` (never macOS Keychain).
- Use `restaurant config path` to get the config location.
- Use `restaurant doctor` to verify a provider is wired up before trying to book.

## How the router agent selects a provider

Each provider reports its `capabilities` (search, availability, book, snipe, etc.). Before running a command, check `restaurant doctor` output and prefer providers whose capabilities match the requested action. If unsure, use the configured default.

## Adding a new provider

Providers are peer modules under `src/providers/` in the restaurant-cli repo. Adding one only requires:
1. A new `src/providers/<id>/` implementing the `Provider` interface.
2. One line in `src/providers/bootstrap.ts`.

The CLI, OpenClaw plugin, and this skill all discover the new provider automatically via the registry.

## When to delegate to the router agent

If the user asks to book, search, or manage a reservation, delegate to the `restaurant-router` agent — it reads the provider registry and picks the right provider-specific agent (e.g. `resy-agent`).
