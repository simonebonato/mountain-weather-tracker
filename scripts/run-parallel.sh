#!/usr/bin/env bash
set -euo pipefail
DOTFILES_DIR='/Users/simone.bonato/dotfiles'
exec "$DOTFILES_DIR/scripts/run-parallel.sh" "$@"
