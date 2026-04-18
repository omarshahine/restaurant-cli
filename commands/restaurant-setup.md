---
description: Interactively configure credentials for a reservation provider (Resy, OpenTable, etc.)
---

# Restaurant Setup

Run:

```bash
restaurant setup $ARGUMENTS
```

If no provider id was supplied, ask which provider they want to set up — show the list from `restaurant doctor`.

The setup flow is fully interactive. For Resy, it prompts for email + password, exchanges them for a durable auth token via `POST /3/auth/password`, and writes the token to `~/.secrets.env` as `RESY_AUTH_TOKEN`. The password is consumed and discarded — it's never persisted.

After setup, run `restaurant doctor` to confirm auth succeeded.
