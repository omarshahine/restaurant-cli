---
name: restaurant
description: |
  Book restaurant reservations via the `restaurant` CLI (backed by Resy, OpenTable, Tock, and other pluggable providers). Use when:
  - User asks to book, search, or manage a restaurant reservation
  - User mentions "Resy", "OpenTable", "Tock", or "SevenRooms"
  - User mentions a restaurant name and a date/time
  - User says "snipe that reservation" or mentions a release-time booking
  - User wants to list or cancel upcoming dining reservations
  - User mentions a "reservation window" or "when slots open"
---

# restaurant

The `restaurant` CLI wraps multiple reservation platforms behind a single command surface. The CLI is installed via `npm i -g restaurant-cli`.

## Quick reference

```bash
restaurant setup resy                                    # one-time credential setup per provider
restaurant doctor                                        # verify config + auth + scheduler health
restaurant search "le bernardin"                         # venue search (default provider)
restaurant search "le bernardin" --provider opentable    # cross-provider

restaurant availability --venue 1387 --date 2026-05-01 --party 2
restaurant book --venue 1387 --date 2026-05-01 --time 19:30 --party 2
restaurant list [--upcoming]
restaurant cancel <reservation-id>

restaurant snipe --venue 1387 --date 2026-05-01 --time 19:30 --party 2 \
                 --release-at 2026-04-30T10:00-07:00
restaurant jobs list
restaurant jobs cancel <job-id>
restaurant jobs logs <job-id>
```

All destructive commands (`book`, `cancel`, `snipe`, `jobs cancel`) prompt for y/N confirmation unless you pass `--yes`.

## Provider capabilities as of 2026-04

| Provider | search | availability | book | cancel | list | snipe | bookUrl |
|---|---|---|---|---|---|---|---|
| Resy | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| OpenTable | ✓ | — | — | — | — | — | ✓ |

OpenTable can't complete bookings through the API — the `bookUrl` capability hands back a deep link you open in your own browser to confirm. OpenTable search runs via browser automation (patchright + persistent Chrome profile) so the first invocation may prompt for Chrome to open.

Always call `restaurant doctor` before trying a provider-specific action — capabilities are the source of truth, not this table.

## Configuration

- Config: `~/.config/restaurant-cli/config.yaml`
- Secrets: `~/.secrets.env` (never macOS Keychain)
- Run `restaurant config path` to get the config location

## Routing

Any booking request should go through the `restaurant-router` agent first — it reads `restaurant doctor` to pick the right provider agent (`resy-agent`, `opentable-agent`) based on user intent and available capabilities.
