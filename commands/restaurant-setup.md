---
name: restaurant-setup
description: Interactively configure credentials for a reservation provider (Resy, OpenTable, etc.)
---

Run `restaurant setup $ARGUMENTS` and walk the user through each prompt. If no provider id was supplied, ask which provider they want to set up — show the list from `restaurant doctor`.

After setup, run `restaurant doctor` to confirm auth succeeded.
