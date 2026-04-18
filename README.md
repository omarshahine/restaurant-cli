# restaurant-cli

Pluggable CLI for booking restaurant reservations — Resy today, OpenTable / Tock / SevenRooms coming. Every provider is an independent module that plugs into the same interface; the CLI, OpenClaw plugin, and Claude Code plugin all read from the provider registry, not from any one provider.

## Install

```bash
npm i -g restaurant-cli
# or
npx restaurant-cli --help
```

## Quick start

```bash
restaurant setup resy              # store credentials (interactive)
restaurant search "le bernardin"   # venue search
restaurant doctor                  # sanity check config + auth
```

Later milestones add `availability`, `book`, `cancel`, `list`, and `snipe` (timed-release booking).

## Architecture

Four consumers of the same core:

1. **Plain CLI** — `restaurant <subcommand>`
2. **Library** — `import { providers, Scheduler } from "restaurant-cli"`
3. **OpenClaw plugin** — registers provider-agnostic tools via the host
4. **Claude Code plugin** — skills, agents, slash commands backed by the CLI

The pluggable seam:

```
src/providers/
  types.ts         ← Provider interface + ProviderCapabilities
  registry.ts      ← runtime dispatcher
  bootstrap.ts     ← the ONLY file that knows every provider
  resy/            ← first provider; future modules are peer directories
  # opentable/, tock/, sevenrooms/ — added the same way
```

Adding a new provider is a two-file change: create `src/providers/<name>/` implementing `Provider`, add one line to `bootstrap.ts`. No core code changes.

## Config

- `~/.config/restaurant-cli/config.yaml` — non-secret config (default provider, timezone, logging).
- `~/.secrets.env` — auth tokens (`RESY_API_TOKEN`, etc.) referenced via `SecretRef`.

Never uses macOS Keychain.

## Commands

| Command | Status |
|---|---|
| `setup <provider>` | M1 ✓ |
| `search <query>` | M1 ✓ |
| `doctor` | M1 ✓ |
| `version` | M1 ✓ |
| `availability` | M2 ✓ (Resy) |
| `book` | M2 ✓ (Resy) |
| `list` | M2 ✓ (Resy) |
| `cancel` | M2 ✓ (Resy) |
| `snipe` | M3 ✓ (Resy) |
| `jobs` | M3 ✓ |

## Providers

| Provider | search | availability | book | cancel | list | snipe | bookUrl |
|---|---|---|---|---|---|---|---|
| Resy | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| OpenTable | ✓ | wired* | — | — | — | — | ✓ |

\* OpenTable availability is coded against the `/booking/experiences-availability` page's `__NEXT_DATA__` hydration payload but capability stays `false` until the parser is live-verified. Flip `capabilities.availability` in `src/providers/opentable/provider.ts` once you've confirmed a successful scrape.

OpenTable has no public consumer API and Akamai Bot Manager blocks raw HTTP. Live venue search works via a browser-automation module: [patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-nodejs) (stealth-patched Playwright fork) + persistent Chrome profile + channel:chrome + ~4.5s mouse jitter defeats Akamai reliably. The module drives `opentable.com`'s own homepage search and sniffs the `Autocomplete` GraphQL response. To use it: `npx playwright install chromium` + `pnpm add patchright` once, then `restaurant search "carbone" --provider opentable`.

Booking completion is intentionally **not** available through the browser path — OpenTable confirmation requires a logged-in session + real user interaction, and automated confirmation has historically tripped bot-detection *and* accidentally completed real reservations (see [mikehe123/opentable-reservations](https://github.com/mikehe123/opentable-reservations)). The `bookUrl` capability hands you a deep link to finish the booking yourself in your own browser.

## Attribution

The Resy provider module is a clean TypeScript reimplementation inspired by the design of [lgrees/resy-cli](https://github.com/lgrees/resy-cli) (MIT). No code was copied; endpoint-level citations are inline in `src/providers/resy/client.ts`. See [`NOTICE`](./NOTICE).

## License

MIT — see [`LICENSE`](./LICENSE).
