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
| `search <query>` | M1 ✓ (Resy) |
| `doctor` | M1 ✓ |
| `version` | M1 ✓ |
| `availability` | Resy: M2 |
| `book` | Resy: M2 |
| `list` | M2 |
| `cancel` | M2 |
| `snipe` | M3 |
| `jobs` | M3 |

## Providers

| Provider | search | availability | book | cancel | list | snipe | bookUrl |
|---|---|---|---|---|---|---|---|
| Resy | ✓ | M2 | M2 | M2 | M2 | M3 | — |
| OpenTable | — | — | — | — | — | — | ✓ |

OpenTable has no public consumer API, and its `/dapi/` endpoints are protected by Akamai Bot Manager — live probing (2026-04) confirmed that pure-Node/curl HTTP gets a 403 regardless of header spoofing, because the block is TLS-fingerprint-level. The one capability that honestly works today is `bookUrl`: OpenTable produces a deep link you click to complete the booking in your browser with your OpenTable account.

The HTTP parser code (`src/providers/opentable/{client,search,availability}.ts`) is kept as scaffolding for a future browser-automation module (Chrome CDP) which will feed real response JSON through the same parsers. When that lands, the relevant `capabilities` flags flip to true with no other change.

## Attribution

The Resy provider module is a clean TypeScript reimplementation inspired by the design of [lgrees/resy-cli](https://github.com/lgrees/resy-cli) (MIT). No code was copied; endpoint-level citations are inline in `src/providers/resy/client.ts`. See [`NOTICE`](./NOTICE).

## License

MIT — see [`LICENSE`](./LICENSE).
