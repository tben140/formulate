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

# nvm is not written for `set -eu`: an unset variable or a non-zero internal
# check inside nvm.sh would end this script before any Node is pinned. So the
# strict modes are lifted around every nvm call, and restored after.
with_nvm() {
  set +eu
  "$@"
  local status=$?
  set -eu
  return "$status"
}

if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  with_nvm . "$NVM_DIR/nvm.sh"
fi

# Native type stripping is on by default from 22.18 on the 22 line, and from
# 23.6 on the 23 line (23.0 to 23.5 only had it behind a flag).
node_supports_type_stripping() {
  local version major minor
  version="$("$1" -v 2>/dev/null)" || return 1
  version="${version#v}"
  major="${version%%.*}"
  minor="${version#*.}"
  minor="${minor%%.*}"
  [ "$major" -ge 24 ] ||
    { [ "$major" -eq 23 ] && [ "$minor" -ge 6 ]; } ||
    { [ "$major" -eq 22 ] && [ "$minor" -ge 18 ]; }
}

# The newest Node that nvm has on disk *and* that qualifies; not simply the
# newest, which could be an early 23.x (sort -V handles version ordering).
target=""
while IFS= read -r candidate; do
  if node_supports_type_stripping "$candidate"; then
    target="$candidate"
    break
  fi
done < <(ls -d "$NVM_DIR"/versions/node/v*/bin/node 2>/dev/null | sort -rV || true)

if [ -z "$target" ]; then
  if ! command -v nvm >/dev/null 2>&1; then
    echo "install.sh: no Node >= 22.18 installed, and nvm isn't available to install one" >&2
    exit 1
  fi
  with_nvm nvm install 22 >/dev/null
  target="$(with_nvm nvm which 22)"
fi

if ! node_supports_type_stripping "$target"; then
  echo "install.sh: could not find a Node >= 22.18 (or >= 23.6) for the tokens build" >&2
  exit 1
fi

bin_dir="/usr/local/cargo/bin"
if [ -w "$bin_dir" ]; then
  ln -sf "$target" "$bin_dir/node"
else
  sudo ln -sf "$target" "$bin_dir/node"
fi

echo "install.sh: pinned default node -> $target ($("$target" -v))"
