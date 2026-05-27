#!/usr/bin/env bash
set -euo pipefail
DOTFILES_DIR='/Users/simone.bonato/dotfiles'
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$DOTFILES_DIR/scripts/run-sandcastle.sh" --project-root "$PROJECT_DIR" "$@"
