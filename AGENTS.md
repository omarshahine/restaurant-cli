## Clawpatch Code Review

This repo uses [Clawpatch](https://clawpatch.ai) for local automated code review. Keep `.clawpatch/` ignored; it is generated runtime state containing features, findings, reports, runs, and patch attempts.

Standard workflow:

```bash
clawpatch doctor
clawpatch init          # first time only
clawpatch map
clawpatch review --limit 10
clawpatch report --output .clawpatch/reports/summary.md
clawpatch show --finding <id>
clawpatch fix --finding <id>
clawpatch revalidate --finding <id>
```

If this repo needs hand-authored feature coverage, keep those curated definitions in `tools/clawpatch/features/` and sync/copy them into `.clawpatch/features/` before review. Do not commit `.clawpatch/` generated state.


<!-- BEGIN CLAUDE MEMORY IMPORT: -Users-omarshahine-GitHub-restaurant-cli -->
## Imported Claude Project Memory

Durable memory promoted from `~/.claude/projects/-Users-omarshahine-GitHub-restaurant-cli/memory` during the AGENTS.md migration. Keep this section current when project-specific operating knowledge changes.

### memory/MEMORY.md

- [No "goat" in command/feature names](feedback_no_goat_naming.md) — never use the word "goat" in command names, flags, or user-facing copy when porting from table-reservation-goat

### memory/feedback_no_goat_naming.md

---
name: No "goat" in command/feature names
description: Never use the word "goat" in restaurant-cli command names, flags, or user-facing copy when porting from table-reservation-goat
type: feedback
originSessionId: 9bf75f31-0ab9-4a07-bd45-3048d6703916
---
Do not use the word "goat" anywhere in restaurant-cli command names, flag names, subcommand names, or user-facing copy.

**Why:** Stated preference while porting features from the `table-reservation-goat` CLI. The cross-network unified-search command in that tool is literally named `goat` — when porting, pick a different name.

**How to apply:** When porting `table-reservation-goat` features, rename the `goat` command (the cross-network/multi-provider unified search). Either roll its behavior into the existing `search` command (default to fan-out across all providers, use `--provider` to scope) or pick a neutral name like `find`, `across`, or `any`. Other trg names (`earliest`, `drift`, `watch`, `sync`) are fine to keep as-is — only "goat" is off-limits. Also avoid it in docs, help text, and skill copy.

<!-- END CLAUDE MEMORY IMPORT: -Users-omarshahine-GitHub-restaurant-cli -->
