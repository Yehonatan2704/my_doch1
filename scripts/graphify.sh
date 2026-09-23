#!/usr/bin/env bash
# graphify wrapper — the one entry point for the codebase knowledge graph (see CLAUDE.md "Token rules").
#
#   scripts/graphify.sh                    install graphify if missing, then rebuild graphify-out/ (≈2s, 0 LLM tokens)
#   scripts/graphify.sh query "<terms>"    any other args are passed to the graphify CLI (query, explain, path, affected…)
#
# The graph is rebuilt locally from code (AST) + the committed doc cache (graphify-out/cache/semantic),
# so nobody pays LLM tokens to build it. Never fails the caller: problems print one line and exit 0.
set -uo pipefail

VERSION="0.9.66"
VENV="${GRAPHIFY_VENV:-$HOME/.venvs/graphify}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$VENV/bin/graphify"
cd "$ROOT" || exit 0

install() {
  local py=""
  for c in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(sys.version_info < (3, 10))' 2>/dev/null; then
      py="$c"; break
    fi
  done
  if [ -z "$py" ]; then
    echo "graphify: needs Python >= 3.10 (macOS: brew install python@3.13). Skipped — read files normally."
    exit 0
  fi
  echo "graphify: first-time install into $VENV …" >&2
  "$py" -m venv "$VENV" >/dev/null 2>&1 \
    && "$VENV/bin/pip" install -q --disable-pip-version-check "graphifyy[sql]==$VERSION" >/dev/null 2>&1 \
    || { echo "graphify: install failed (try: $py -m venv $VENV && $VENV/bin/pip install 'graphifyy[sql]==$VERSION'). Skipped."; exit 0; }
}

[ -x "$BIN" ] || install

# Lets the /graphify skill find the interpreter without re-running its own install step.
mkdir -p graphify-out
printf '%s' "$VENV/bin/python" > graphify-out/.graphify_python

if [ $# -gt 0 ]; then
  exec "$BIN" "$@"
fi

if "$BIN" update . >graphify-out/.update.log 2>&1; then
  nodes=$("$VENV/bin/python" -c "import json;print(len(json.load(open('graphify-out/graph.json'))['nodes']))" 2>/dev/null)
  echo "graphify: graph ready (${nodes:-?} nodes). Locate code with scripts/graphify.sh query \"<terms>\" before reading files (CLAUDE.md → Token rules)."
else
  echo "graphify: rebuild failed — see graphify-out/.update.log. Read files normally."
fi
exit 0
