---
name: restaurant-snipe
description: Schedule a future reservation to book at the exact release time (e.g. 10am sharp when slots open)
---

The user wants to queue a sniped booking. Collect the following (via AskUserQuestion if any are missing):

- venue id (if the user gave a name, run `restaurant search "<name>"` first)
- party size
- date (YYYY-MM-DD)
- time (HH:mm, 24h)
- release-at (ISO8601 with timezone offset, e.g. `2026-04-30T10:00-04:00`)
- provider (default: configured default; must have `snipe` capability per `restaurant doctor`)

Then run:

```
restaurant snipe --provider <id> --venue <id> --party <n> --date <d> --time <t> --release-at <iso>
```

Confirm the scheduled job id and runAt with the user. Tell them they can run `restaurant jobs` to inspect or `restaurant jobs cancel <id>` to back out.
