#!/bin/bash
set -e
DEST="$HOME/.claude/skills/session"
SRC="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$DEST/lib/__tests__"
cp "$SRC/SKILL.md" "$DEST/SKILL.md"
cp "$SRC/session.ts" "$DEST/session.ts"
cp "$SRC/mcp-server.ts" "$DEST/mcp-server.ts"
cp "$SRC/lib/format.ts" "$DEST/lib/format.ts"
cp "$SRC/lib/indexer.ts" "$DEST/lib/indexer.ts"
cp "$SRC/lib/search.ts" "$DEST/lib/search.ts"

echo "Deployed to $DEST"
