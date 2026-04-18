#!/usr/bin/env bash
# One-shot bootstrap for the restaurant-cli OpenClaw plugin, pre-npm-publish.
#
# Does only the parts that have to happen before `restaurant` is on PATH:
#   1. pnpm/npm install
#   2. build
#   3. link binary globally so `restaurant …` is callable
#   4. register with OpenClaw as a linked plugin
#
# After this finishes, run:
#   restaurant setup resy-openclaw
# …which handles auth + mirrors creds into ~/.openclaw/openclaw.json.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: '$1' not found on PATH. $2" >&2
    exit 1
  }
}

require_cmd node "Install Node.js 20+ first."
require_cmd openclaw "Install OpenClaw first (see https://docs.openclaw.ai)."

PM=""
for candidate in pnpm npm; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PM="$candidate"
    break
  fi
done
[ -n "$PM" ] || { echo "error: need pnpm or npm on PATH." >&2; exit 1; }

echo "==> Using $PM"
echo "==> Installing dependencies"
"$PM" install

echo "==> Building"
"$PM" run build

echo "==> Linking 'restaurant' binary globally"
if [ "$PM" = "pnpm" ]; then
  pnpm link --global
else
  npm link
fi

echo "==> Registering with OpenClaw as a linked plugin"
# --dangerously-force-unsafe-install is required because the plugin shells
# out to the `restaurant` CLI (child_process use is flagged by the scanner).
openclaw plugins install --link --dangerously-force-unsafe-install "$repo_root"

cat <<'EOF'

✔ Bootstrap complete. Next steps:

  1. restaurant setup resy-openclaw
       Interactive Resy login → writes creds to ~/.secrets.env + mirrors
       them into ~/.openclaw/openclaw.json under plugins.entries.restaurant-cli.

  2. Restart the OpenClaw gateway so it picks up the new plugin config.

Once those land, the 6 restaurant_* tools are available to OpenClaw agents.
EOF
