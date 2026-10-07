#!/bin/bash
PROOFDOCK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROOFDOCK_NODE="${PROOFDOCK_NODE:-$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
if [ ! -x "$PROOFDOCK_NODE" ]; then PROOFDOCK_NODE="$(command -v node)"; fi
export PATH="$(dirname "$PROOFDOCK_NODE"):$PATH"
cd "$PROOFDOCK_ROOT"
