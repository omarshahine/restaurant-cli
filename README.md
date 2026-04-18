# restaurant-cli

Pluggable CLI for booking restaurant reservations across Resy, OpenTable, Tock, and SevenRooms. Every provider is an independent module that plugs into the same interface; the CLI, OpenClaw plugin, and Claude Code plugin all read from the provider registry, not from any one provider.

## Install

Once published to npm:

```bash
npm i -g restaurant-cli
# or
npx restaurant-cli --help
```

For local development before publish:

```bash
git clone https://github.com/omarshahine/restaurant-cli.git
cd restaurant-cli
npm install
npm run build
npm link         # puts `restaurant` on your PATH

# OpenTable support (optional — browser automation peer deps):
npm i patchright
npx playwright install chromium
```

## Quick start

```bash
# one-time credential setup per provider (email + password; token persisted)
restaurant setup resy

# sanity check — config, auth, scheduler health
restaurant doctor

# search
restaurant search "le bernardin"
restaurant search "carbone" --provider opentable

# availability + book (Resy)
restaurant availability --venue 1387 --date 2026-05-15 --party 2
restaurant book --venue 1387 --date 2026-05-15 --time 19:30 --party 2

# list + cancel
restaurant list --upcoming
restaurant cancel <reservation-id>

# snipe — queue a booking for when the reservation window opens
restaurant snipe --venue 1387 --date 2026-05-15 --time 19:30 --party 2 \
                 --release-at 2026-04-30T10:00-07:00
restaurant jobs list
restaurant jobs cancel <job-id>
restaurant jobs logs <job-id>

# OpenTable hand-off (no API booking; deep link → user confirms in browser)
restaurant book --venue 1046758 --date 2026-05-15 --time 19:00 --party 2 \
                --provider opentable
```

All destructive commands (`book`, `cancel`, `jobs cancel`, `snipe`) prompt for y/N confirmation. Pass `--yes` to skip — useful for scripts and the snipe fire-time self-invocation.

## Commands

| Command | Status |
|---|---|
| `setup <provider>` | ✓ |
| `search <query>` | ✓ |
| `doctor` | ✓ |
| `version` | ✓ |
| `availability` | ✓ (Resy) |
| `book` | ✓ (Resy) |
| `list` | ✓ (Resy) |
| `cancel` | ✓ (Resy) |
| `snipe` | ✓ (Resy) |
| `jobs list/cancel/logs` | ✓ |
| `config get/set/path` | ✓ |

## Providers

| Provider | search | availability | book | cancel | list | snipe | bookUrl |
|---|---|---|---|---|---|---|---|
| Resy | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| OpenTable | ✓ | wired* | — | — | — | — | ✓ |

\* OpenTable availability is coded against the `/booking/restref/availability` page's `__NEXT_DATA__` hydration payload but capability stays `false` until the parser is live-verified against a real response. Flip `capabilities.availability` in `src/providers/opentable/provider.ts` once you've confirmed a successful scrape.

### OpenTable specifics

OpenTable has no public consumer API and Akamai Bot Manager blocks raw HTTP. Live venue search works via a browser-automation module: [patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-nodejs) (stealth-patched Playwright fork) + persistent Chrome profile + `channel: "chrome"` + ~4.5s mouse jitter defeats Akamai reliably. The module drives `opentable.com`'s own homepage search and sniffs the `Autocomplete` GraphQL response. First run opens a headed Chrome window for ~5-10s — that's intentional; headless trips Akamai.

Booking completion is intentionally **not** available through the API — OpenTable confirmation requires a logged-in session + real user interaction, and automated confirmation has historically tripped bot-detection *and* accidentally completed real reservations (see [mikehe123/opentable-reservations](https://github.com/mikehe123/opentable-reservations)). The `bookUrl` capability generates a `/restref/client` hand-off URL (verified live 2026-04-18) that OpenTable redirects into its own booking flow with the time-slot picker rendered — you complete the reservation yourself.

## Architecture

Four consumers of the same core:

1. **Plain CLI** — `restaurant <subcommand>`
2. **Library** — `import { providers, Scheduler } from "restaurant-cli"`
3. **OpenClaw plugin** — registers 6 provider-agnostic tools (`restaurant_search`, `restaurant_availability`, `restaurant_book`, `restaurant_schedule_snipe`, `restaurant_list`, `restaurant_cancel`) via the host
4. **Claude Code plugin** — skill + router agent + provider-specific agents (`resy-agent`, `opentable-agent`) + slash commands (`/restaurant`, `/restaurant-setup`, `/restaurant-book`, `/restaurant-snipe`, `/restaurant-jobs`), all shelling out to the CLI

The pluggable seam:

```
src/providers/
  types.ts         ← Provider interface + ProviderCapabilities
  registry.ts      ← runtime dispatcher
  bootstrap.ts     ← the ONLY file that knows every provider
  resy/            ← first provider; future modules are peer directories
  opentable/       ← second provider; proves the seam
  # tock/, sevenrooms/ — added the same way
```

Adding a new provider is a two-file change: create `src/providers/<name>/` implementing `Provider`, add one line to `bootstrap.ts`. No core-code changes.

## Claude Code plugin

Installs from Omar's private marketplace:

```
/plugin install restaurant-cli@omarshahine-plugins
```

See the `skills/`, `agents/`, and `commands/` directories for the plugin surface.

## Config

- `~/.config/restaurant-cli/config.yaml` — non-secret config (default provider, timezone, logging).
- `~/.secrets.env` — auth tokens (`RESY_AUTH_TOKEN`, etc.) referenced via `SecretRef`.

Never uses macOS Keychain.

## Snipe how it works

`restaurant snipe` queues a booking to fire at a specific release time via POSIX `at`:

- `--release-at` takes ISO8601 with timezone offset (e.g. `2026-04-30T10:00-07:00`). Must be in the future.
- The job is wrapped in a bash script that sources `~/.secrets.env` at fire time so the auth token is present. Never written to the at-spool in plaintext.
- Fire-time output goes to `~/.local/state/restaurant-cli/logs/<job-id>.log` — JSONL `snipe.start`/`snipe.end` events plus the `restaurant book --yes --json` output.
- Inspect via `restaurant jobs list` / `logs <id>`; cancel via `jobs cancel <id>` (calls `atrm` + removes the local metadata row).

Resolution is per-minute (POSIX `at` limit). Sub-minute sniping requires a daemon backend, which is not implemented.

## Attribution

The Resy provider module is a clean TypeScript reimplementation inspired by the design of [lgrees/resy-cli](https://github.com/lgrees/resy-cli) (MIT). No code was copied; endpoint-level citations are inline in `src/providers/resy/client.ts`. See [`NOTICE`](./NOTICE).

## License

MIT — see [`LICENSE`](./LICENSE).
