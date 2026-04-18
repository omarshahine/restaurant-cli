---
description: Schedule a future reservation to book at the exact release time (e.g. 10am sharp when Resy slots open)
---

# Restaurant Snipe

The user wants to queue a sniped booking. Collect the following (via AskUserQuestion if any are missing):

- **venue id** — if the user gave a name, run `restaurant search "<name>"` first and confirm the venue
- **party size**
- **date** (YYYY-MM-DD)
- **time** (HH:mm, 24h)
- **release-at** — ISO8601 with timezone offset, e.g. `2026-04-30T10:00-04:00`. This is when the at-job fires, not the reservation time.
- **provider** — default: configured default; must have `snipe` capability per `restaurant doctor`. As of 2026-04, only Resy supports sniping.

Then run:

```bash
restaurant snipe --provider <id> --venue <id> --party <n> --date <d> --time <t> --release-at <iso>
```

The CLI will prompt for y/N confirmation unless you pass `--yes`. Confirm with the user in chat first, then pass `--yes` so there's no second prompt.

After queuing, tell the user:
- The job id and `runAt` timestamp
- `restaurant jobs list` to inspect the queue
- `restaurant jobs cancel <job-id>` to back out
- `restaurant jobs logs <job-id>` to see the fire-time output (available after the job runs)

Under the hood, the CLI pipes the job to POSIX `at` and writes a bash wrapper that sources `~/.secrets.env` at fire time so the booking command has access to `RESY_AUTH_TOKEN`.
