---
description: Interactively configure credentials for a reservation provider (Resy, OpenTable, etc.)
---

# Restaurant Setup

Run:

```bash
restaurant setup $ARGUMENTS
```

If no provider id was supplied, ask which provider they want to set up — show the list from `restaurant doctor`.

The setup flow is fully interactive. For Resy, it prompts for email + password and exchanges them for a durable auth token via `POST /3/auth/password`. The password is consumed and discarded. **It is env-first: the token is NOT written to disk.** Setup saves an env `tokenRef` in `config.yaml` and prints an `export RESY_AUTH_TOKEN='…'` line for the user to add to their own environment (e.g. their shell secrets file). The token is read from the environment at runtime.

After the user adds the export line and sources it, run `restaurant doctor` to confirm auth succeeded. (Until then, doctor reports the token as missing — that's expected.)
