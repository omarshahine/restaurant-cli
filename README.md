# restaurant-cli

Pluggable CLI for booking restaurant reservations across Resy, OpenTable, Tock, and SevenRooms. Every provider is an independent module that plugs into the same interface; the CLI, OpenClaw plugin, and Claude Code plugin all read from the provider registry, not from any one provider.

**Agent-friendly.** Every command supports `--agent` (= `--json --compact --no-color --no-input --yes`), `--select` for field projection, `--csv` for table output, `--dry-run` for preview, and typed exit codes. `restaurant agent-context` emits a structured JSON manifest of every command, flag, provider, and exit code for autonomous callers.

## Install

```bash
npm i -g restaurant-cli
# or
npx restaurant-cli --help
```

OpenTable browser-automation support is optional (the API path doesn't need it):

```bash
npm i -g patchright
npx playwright install chromium
```

### From a clone (for development)

```bash
git clone https://github.com/omarshahine/restaurant-cli.git
cd restaurant-cli
npm install        # `prepare` runs `npm run build` automatically
npm link           # puts `restaurant` on your PATH
```

### From GitHub directly (no npm)

```bash
npm i -g github:omarshahine/restaurant-cli
```

The package's `prepare` script builds `dist/` automatically during install, so the `restaurant` binary is on your PATH right away.

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

# OpenTable: slug → numeric ID, then fast availability via the GraphQL API path
restaurant lookup --slug carbone-new-york
restaurant availability --venue 8033 --date 2026-05-15 --party 2 --provider opentable

# OpenTable hand-off (no API booking; deep link → user confirms in browser)
restaurant book --venue 1046758 --date 2026-05-15 --time 19:00 --party 2 \
                --provider opentable

# multi-provider — search every registered provider and merge
restaurant search "alinea"

# soonest open slot per venue across all providers
restaurant earliest alinea,le-bernardin,smyth --within 14d --party 2

# Tock authenticated reads — import cookies from your logged-in Chrome session
# 1) open exploretock.com → DevTools → Application → Cookies, copy as JSON, save to ~/tock-cookies.json
# 2) restaurant auth login tock --from-file ~/tock-cookies.json
restaurant list --provider tock

# agent self-discovery
restaurant agent-context | jq '.commands[].name'
```

All destructive commands (`book`, `cancel`, `jobs cancel`, `snipe`) prompt for y/N confirmation. Pass `--yes` to skip — useful for scripts and the snipe fire-time self-invocation. Pass `--agent` for the full agent default set.

## Agent mode

Every command honors a consolidated agent flag set:

| Flag | Effect |
|---|---|
| `--agent` | All of the below: `--json --compact --no-color --no-input --yes` |
| `--json` | JSON output |
| `--csv` | CSV output (table/array results) |
| `--compact` | Drop verbose fields from rows; keep id, name, status, time, date, etc. |
| `--select id,name,time` | Project named fields (dotted paths) from the JSON result |
| `--no-color` | Disable ANSI colors |
| `--no-input` | Fail closed instead of prompting (paired with `--yes` for destructive commands) |
| `--yes` | Skip y/N confirmation prompts |
| `--dry-run` | Build and print the request envelope without firing |

Env-var floors (override flags):

| Var | Effect |
|---|---|
| `RESTAURANT_CLI_AGENT=1` | Every command behaves as if `--agent` were passed |
| `RESTAURANT_CLI_DRY_RUN=1` | Every destructive command runs as `--dry-run` |
| `RESTAURANT_CLI_OT_MODE=api\|browser\|auto` | OpenTable transport selector |
| `RESTAURANT_CLI_TOCK_MODE=api\|browser\|auto` | Tock transport selector |
| `RESTAURANT_CLI_TOCK_ALLOW_BOOK=1` | Required to ever fire a real Tock book (default-off safety floor) |

`book` also supports `--idempotent` — pre-flights `list` for an existing matching `(venue, date, time, party)` reservation and returns it instead of double-booking on retry. Used automatically by the snipe fire-time wrapper.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 2 | usage error (bad flags, missing required arg) |
| 3 | not found (venue, reservation, slot, slug) |
| 5 | api error (provider 5xx, malformed response, capability miss) |
| 6 | auth error (missing/invalid credentials) |
| 7 | rate limited (HTTP 429) |
| 10 | config error (bad/missing config file) |

`restaurant doctor --fail-on stale|error` returns non-zero when the corresponding health level is reached — useful for CI.

## Self-describing manifest

`restaurant agent-context` emits a single JSON document describing every command, subcommand, flag (including type, default, required), every registered provider's capabilities, every documented env-var floor, and the exit-code table. An agent can run this once and learn the entire surface without scanning `--help` for each subcommand.

## Commands

| Command | Status |
|---|---|
| `setup <provider>` | ✓ |
| `search <query>` | ✓ |
| `doctor` | ✓ |
| `version` | ✓ |
| `availability` | ✓ (Resy + OpenTable API) |
| `lookup --slug` | ✓ (OpenTable) |
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
| OpenTable | ✓ | ✓ | — | — | — | — | ✓ |
| Tock | ✓ | ✓ | — | — | — | — | — |

### Tock specifics

Tock anonymous reads (`search`, `availability`) shell out to [`table-reservation-goat-pp-cli`](https://github.com/mvanhorn/printing-press-library) — a Go binary by Matt Van Horn / Pejman Pour-Moezzi (Apache-2.0) that handles two things Node can't do cleanly: (1) Chrome TLS fingerprint impersonation to clear Cloudflare, and (2) sourcing the page-issued `x-tock-session` token Tock's React bundle mints client-side. Install it once:

```bash
npx -y @mvanhorn/printing-press install table-reservation-goat
# writes ~/go/bin/table-reservation-goat-pp-cli
```

Add `~/go/bin` to your PATH or set `RESTAURANT_CLI_TRG_BIN` to the binary path. Then:

```bash
restaurant search "canlis" --provider tock --agent
restaurant availability --venue canlis --date 2026-05-12 --party 2 --provider tock --agent
```

`restaurant doctor` checks the binary is on disk and surfaces an install hint when missing.

**What's not wired:** `list`, `cancel`, `book`. Tock's authenticated calls require imported session cookies (path scaffolded via `restaurant auth login tock --from-file <path>`); the calls themselves aren't built yet. Tock `book` is form-submit page navigation (not XHR) and needs a chromedp-style flow with CVC prompting — upstream trg defers this too. The capability flags are honest-false for these.

### OpenTable specifics

OpenTable has no public consumer API and Akamai Bot Manager blocks raw HTTP. There are two live paths:

- **API path (default, fast)** — direct `/dapi/fe/gql` POSTs with a CSRF token scraped from the homepage and a persisted-query SHA256 hash for the `RestaurantsAvailability` operation. No browser. Approach ported (clean reimplementation, no code copied) from Jeff Steinbok's [openclaw-hub OpenTable plugin](https://github.com/JeffSteinbok/openclaw-hub/tree/main/plugins/opentable). Jeff's Python uses `curl_cffi` for Chrome TLS fingerprinting; Node's `undici` uses a different fingerprint, so this path may 403 on Akamai depending on IP/region.
- **Browser path (slow, reliable)** — [patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-nodejs) (stealth-patched Playwright fork) + persistent Chrome profile + `channel: "chrome"` + ~4.5s mouse jitter defeats Akamai reliably. First run opens a headed Chrome window for ~5-10s; headless trips Akamai.

Mode is picked at call time via `RESTAURANT_CLI_OT_MODE`:
- `auto` (default): try API first, fall back to browser on 403.
- `api`: API-only, errors if blocked.
- `browser`: skip API, go straight to patchright.

When OpenTable rotates the persisted-query hash (rare), set `OPENTABLE_AVAILABILITY_HASH=<sha256>` to override without a code change. Extract a fresh hash from the network tab on opentable.com.

Search is browser-only — OpenTable doesn't expose a public text-search GraphQL operation, only an autocomplete that needs DOM driving. Use `restaurant lookup --slug <slug>` if you already know the URL slug; that path is API-only and skips the browser.

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

## OpenClaw plugin

```bash
npm i -g restaurant-cli
openclaw plugins install restaurant-cli
restaurant setup resy-openclaw    # auth + mirror creds into OpenClaw config
# Restart the OpenClaw gateway
```

The `-openclaw` suffix on `setup` is the bridge: `restaurant setup resy` persists
credentials to `~/.secrets.env` + `~/.config/restaurant-cli/config.yaml` (CLI
store); appending `-openclaw` additionally mirrors them into
`plugins.entries.restaurant-cli.config` in `~/.openclaw/openclaw.json` so the
gateway-side tools can find them. Works for any provider — `opentable-openclaw`,
`tock-openclaw`, etc.

### From a clone

```bash
git clone https://github.com/omarshahine/restaurant-cli.git
cd restaurant-cli
./scripts/install-openclaw.sh     # deps + build + link bin + openclaw plugin register
restaurant setup resy-openclaw
```

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
