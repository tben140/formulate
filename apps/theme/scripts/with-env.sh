#!/bin/sh
#
# Runs a command with apps/theme/.env.local loaded into the environment.
#
# Why this exists: development stores are ALWAYS password protected — the
# "Restrict access" setting is greyed out and cannot be disabled until the
# store moves to a paid plan or is transferred to a merchant. Every Shopify
# CLI command that renders the storefront therefore needs the storefront
# password, which it reads from SHOPIFY_FLAG_STORE_PASSWORD.
#
# The CLI reads that from the process environment but does not itself load
# .env files for theme commands, hence this wrapper.
#
# Keeping it here rather than in ~/.zshrc means the secret is scoped to this
# store, stays out of any synced dotfiles, and is already covered by the
# repository's .gitignore (`.env.local`).
#
# Usage:  ./scripts/with-env.sh shopify theme dev --path .

set -e

env_file="$(CDPATH='' cd "$(dirname "$0")/.." && pwd)/.env.local"

if [ -f "$env_file" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
fi

exec "$@"
