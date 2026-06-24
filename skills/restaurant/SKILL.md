---
name: restaurant
description: This skill should be used when the user asks to "book a restaurant", "make a reservation", "find a table", "check restaurant availability at", "snipe a reservation", "cancel a reservation", or names a specific restaurant alongside a date/time. Do not trigger on generic dining chit-chat ("what's for dinner", "where should we eat") that does not request a reservation action. Currently implements Resy (full booking) and OpenTable (search + handoff URL); Tock and SevenRooms are stubbed for future support. Use the `restaurant` CLI (Claude Code context) or the `restaurant_*` tools (OpenClaw context).
metadata:
  openclaw:
    requires:
      bins: [restaurant]
      env:
        # Provider auth tokens (read at fire time by the snipe wrapper).
        - RESY_API_KEY
        - RESY_AUTH_TOKEN
        - OPENTABLE_AUTH_TOKEN
        - TOCK_AUTH_TOKEN
        - SEVENROOMS_AUTH_TOKEN
        # OpenTable provider tunables.
        - OPENTABLE_AVAILABILITY_HASH
        - RESTAURANT_CLI_BROWSER_CHANNEL
        - RESTAURANT_CLI_OT_PROFILE_DIR
        - RESTAURANT_CLI_OT_MODE
        - RESTAURANT_CLI_HEADLESS
        - RESTAURANT_CLI_DEBUG
        # Standard config-dir env (read by config.ts).
        - HOME
        - XDG_CONFIG_HOME
        - XDG_STATE_HOME
        - NODE_ENV
---

# Restaurant reservations

Book, search, cancel, and schedule future bookings ("snipes") across multiple reservation platforms behind a single pluggable surface. Every provider (Resy, OpenTable, and future peers) is implemented as an independent module plugged into the same interface — the tools and CLI dispatch through a shared registry.

## Pick an execution path

Choose based on the tools available in the current session:

1. **`restaurant_*` tools present** (OpenClaw host) — call the tools directly. Parameters documented under *OpenClaw tools* below.
2. **No `restaurant_*` tools** (Claude Code host or plain shell) — shell out to the `restaurant` CLI via Bash. For complex or ambiguous requests, delegate to the `restaurant-router` agent rather than executing directly.

Both paths share one backend, so results are identical — only the calling convention differs. Never invoke a provider's API directly; the plugin's safety invariants (e.g. OpenTable: never auto-submit a booking) live in the CLI and tools.

## Provider capabilities (2026-04)

| Provider    | search | availability | book | cancel | list | snipe | bookUrl |
|-------------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Resy        | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| OpenTable   | ✓ | — | — | — | — | — | ✓ |
| Tock        | — | — | — | — | — | — | — |
| SevenRooms  | — | — | — | — | — | — | — |

OpenTable cannot complete bookings via API; the `bookUrl` capability returns a deep link for the user to confirm in their own browser. Always verify capabilities via `restaurant doctor` (CLI) or the tool's own error handling (OpenClaw) rather than assuming from this table.

### Opt-in gates (off by default)

Two higher-risk capability groups are **disabled unless the user explicitly opts in** via an env var. If a command errors with "off by default", relay the reason and the env var to the user — do **not** set it yourself:

| Capability | Env var | Why gated |
|---|---|---|
| Scheduled sniping (`snipe`, `restaurant_schedule_snipe`) | `RESTAURANT_CLI_ENABLE_SNIPE=1` | Unattended booking — fires later, loads the token at run time, books with no further confirmation. |
| OpenTable + Tock live-site automation (their `search`/`availability`) | `RESTAURANT_CLI_ENABLE_SITE_AUTOMATION=1` | No official API; drives the live site (scraping / anti-bot bypass), which may violate the site's ToS. |

Resy (documented-token API) and OpenTable `bookUrl` hand-off are **not** gated. `snipe --dry-run` previews without the flag.

## CLI quick reference

One-time auth per provider:

```bash
restaurant setup resy              # env-first: prints an export line to add to your env
restaurant setup resy-openclaw     # also writes an env SecretRef into ~/.openclaw/openclaw.json
restaurant doctor                  # verify config, auth, scheduler health
```

Search, check availability, book:

```bash
restaurant search "le bernardin"                    # default provider
restaurant search "carbone" --provider opentable    # cross-provider
restaurant availability --venue 1387 --date 2026-05-15 --party 2
restaurant book --venue 1387 --date 2026-05-15 --time 19:30 --party 2
```

List and cancel:

```bash
restaurant list --upcoming
restaurant cancel <reservation-id>
```

Snipe — queue a booking for a specific future release time:

```bash
restaurant snipe --venue 1387 --date 2026-05-15 --time 19:30 --party 2 \
                 --release-at 2026-04-30T10:00-07:00
restaurant jobs list
restaurant jobs cancel <job-id>
restaurant jobs logs <job-id>
```

All destructive commands (`book`, `cancel`, `snipe`, `jobs cancel`) prompt `y/N` unless `--yes` is passed.

## OpenClaw tools

Six provider-agnostic tools. All accept an optional `provider` string; when omitted the configured default applies.

| Tool | Purpose | Key parameters |
|------|---------|----------------|
| `restaurant_search`         | Venue search                                | `query`, `city?`, `limit?` |
| `restaurant_availability`   | Open slots for a date                       | `venueId`, `date`, `partySize` |
| `restaurant_book`           | Book immediately                            | `venueId`, `date`, `time`, `partySize`, `slotToken?`, `notes?` |
| `restaurant_schedule_snipe` | Queue a future booking at a release time    | `venueId`, `date`, `time`, `partySize`, `releaseAt` |
| `restaurant_list`           | List upcoming/past reservations             | `upcoming?` |
| `restaurant_cancel`         | Cancel a reservation                        | `reservationId` |

Format conventions:

- Dates: `YYYY-MM-DD`
- Times: `HH:mm` (24-hour)
- `releaseAt`: ISO-8601 with offset, e.g. `2026-04-30T10:00-07:00`
- `slotToken`: provider-specific token returned by a prior `restaurant_availability` call; omit to re-lookup at book time

Tool results are text-only (JSON stringified in the `text` content). Parse before acting.

## Routing in Claude Code

For multi-venue searches, ambiguous provider intent, or any multi-step booking flow, invoke the `restaurant-router` agent via the Task tool rather than executing directly. The router inspects `restaurant doctor` output to pick the right provider agent (`resy-agent`, `opentable-agent`) based on the capabilities that are actually live.

Slash commands auto-route through the router:

- `/restaurant <request>` — generic entry point
- `/restaurant-book <args>` — immediate booking intent
- `/restaurant-snipe <args>` — schedule a future booking
- `/restaurant-setup <provider>` — interactive provider auth
- `/restaurant-jobs list|cancel|logs` — inspect scheduled snipes

## Config and secrets

- CLI config: `~/.config/restaurant-cli/config.yaml` (holds an env `tokenRef`, never the token value)
- Secrets: **env-first** — the tool writes no secret file. `setup`/`auth login` print an `export KEY=...` line; you add it to your own env (e.g. `~/.secrets.env`, never macOS Keychain). The token is read from the environment at runtime.
- OpenClaw plugin config: `~/.openclaw/openclaw.json` → `plugins.entries.restaurant-cli.config`

Append `-openclaw` to any `restaurant setup <provider>` invocation to mirror the resulting credentials into the OpenClaw plugin config in addition to the CLI store — the plugin reads only from `pluginConfig`, so this bridge step is required for the OpenClaw tools to find credentials.

Run `restaurant config path` to print the CLI config location without parsing help output.

## Provider-specific notes

- **Resy**: `restaurant setup resy[-openclaw]` prompts for email/password, exchanges credentials for an auth token, and persists it. The public `RESY_API_KEY` has a built-in default; provide a custom one only when overriding.
- **OpenTable**: anonymous — no auth flow. Requires the `patchright` peer dep for browser-driven search:
  ```bash
  pnpm add patchright
  npx playwright install chromium
  ```
  Bookings are deep-link hand-offs: the CLI returns a URL, the user confirms in their own browser.
- **Tock / SevenRooms**: not yet implemented. Attempts surface a `CapabilityError`.

## Safety invariants

- Never auto-submit an OpenTable booking — always hand off to the user's browser.
- Confirm venue identity before booking when the user gave a name: run `restaurant search "<name>"` first and verify the matching `venueId` with the user.
- Treat scheduled snipes as commitments: when the user says "snipe this", the `releaseAt` defaults to the venue's reservation-window opening; verify the time with the user when ambiguous.
