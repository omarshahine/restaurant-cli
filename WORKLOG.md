# Worklog

## 2026-04-16

- Scaffolded restaurant-cli repo with TypeScript/Node 20+ stack.
- Established the pluggable provider architecture (interface + registry + bootstrap) as the project backbone. Resy is the first provider module; OpenTable, Tock, SevenRooms will join as equal peers.
- Decision: TypeScript over Go. Rationale: OpenClaw SDK is TS-native, same codebase can power CLI + OpenClaw plugin without shelling out between them. Cost is a ~2k LOC reimplementation of resy-cli's logic; worth it for single-source-of-truth across four consumer surfaces (CLI, library, OpenClaw, Claude Code).
- Decision: No macOS Keychain. Auth tokens live in `~/.secrets.env` + SecretRef references in config. Matches the user's global secrets policy.
- Decision: POSIX `at` as default scheduler backend. Daemon backend deferred.
- Attribution: design-only inspiration from lgrees/resy-cli (MIT). NOTICE + README credit; endpoint-level citations inline.
- M1 scope: setup + search + doctor + version. Other commands stubbed to report "not implemented yet".
- Open: publish to npm, GitHub, ClawHub, and omarshahine-plugins marketplace — pending user approval of initial commit.
