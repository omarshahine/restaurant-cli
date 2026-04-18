---
description: Inspect or manage scheduled snipe jobs (list / cancel / logs)
---

# Restaurant Jobs

Invoke the CLI's `jobs` subcommand:

```bash
restaurant jobs list                   # show all queued snipes
restaurant jobs cancel <job-id>        # cancel a queued snipe (prompts y/N)
restaurant jobs logs <job-id>          # show the fire-time log (JSONL + book output)
```

Parse `$ARGUMENTS` to decide which sub-action:
- If it looks like `list` / `cancel X` / `logs X`, run that directly.
- If it's empty, default to `list`.
- If it's a bare job id, default to `logs <id>`.

For cancel, use `--yes` only if the user has explicitly confirmed cancellation in chat. Otherwise let the CLI's y/N gate fire.

Logs live at `~/.local/state/restaurant-cli/logs/<job-id>.log` and contain JSONL `snipe.start` / `snipe.end` events plus the `restaurant book` output from when the at-job fired.
