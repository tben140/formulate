#!/usr/bin/env bash
#
# Cloud Agent install script (referenced by .cursor/environment.json).
#
# Two jobs: refresh dependencies exactly as CI does, then guarantee the `node`
# that pnpm/turbo resolve is new enough to run this repo's build.
#
set -euo pipefail

# 1) Dependencies — identical to .github/workflows/ci.yml. Idempotent: a second
#    run is a no-op ("Already up to date").
pnpm install --frozen-lockfile

# 2) Pin a Node >= 22.18 as the default `node` on PATH.
#
# Why this is necessary and not paranoia: packages/tokens builds its CSS with
# `node scripts/build-css.ts` — a TypeScript file run directly, which relies on
# Node's native type stripping (on by default only from Node 22.18). CI is fine
# because it uses actions/setup-node with `node-version: 22`, i.e. the latest
# 22.x. A Cloud Agent is not: its non-interactive tool shell resolves `node` to
# the platform's /exec-daemon/node, pinned to an older 22.x with no stripping,
# so `pnpm turbo build` dies on @formulate/tokens#build with
# "Unknown file extension .ts". That shell reads no profile, so PATH/NODE_OPTIONS
# cannot be injected the usual ways.
#
# /usr/local/cargo/bin is the single PATH entry that precedes /exec-daemon, so a
# `node` symlink there is the one lever that makes a modern Node win. The base
# image already ships one via nvm; we point at the newest installed, falling
# back to installing Node 22 if for some reason none qualifies.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

node_supports_type_stripping() {
  local version major minor
  version="$("$1" -v 2>/dev/null)" || return 1
  version="${version#v}"
  major="${version%%.*}"
  minor="${version#*.}"
  minor="${minor%%.*}"
  [ "$major" -gt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -ge 18 ]; }
}

# Newest Node that nvm has on disk (sort -V handles the version ordering).
target="$(ls -d "$NVM_DIR"/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -n1 || true)"

if [ -z "$target" ] || ! node_supports_type_stripping "$target"; then
  nvm install 22 >/dev/null
  target="$(nvm which 22)"
fi

if ! node_supports_type_stripping "$target"; then
  echo "install.sh: could not find a Node >= 22.18 for the tokens build" >&2
  exit 1
fi

bin_dir="/usr/local/cargo/bin"
if [ -w "$bin_dir" ]; then
  ln -sf "$target" "$bin_dir/node"
else
  sudo ln -sf "$target" "$bin_dir/node"
fi

echo "install.sh: pinned default node -> $target ($("$target" -v))"
