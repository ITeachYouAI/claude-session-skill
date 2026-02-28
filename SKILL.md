---
name: session
description: Search and browse past Claude Code sessions. Indexes all session history already stored by Claude Code and makes it searchable by keyword, project, or date. Can also name sessions for easy recall.
triggers:
  - session
  - find session
  - session search
  - search sessions
  - past session
  - name session
  - session name
  - name this session
  - call this session
  - unname session
  - clear session name
---

# Session Tracker Skill

## Usage

```
/session <query>                 # Search sessions by keyword
/session list                    # Show 20 most recent sessions
/session list --all              # Show all sessions
/session show <id>               # Full details (supports partial IDs)
/session name <name>             # Name the most recent session (by last activity)
/session name <id> <name>        # Name a specific session by ID
/session unname [<id>]           # Clear a session's name
/session rebuild                 # Force rebuild the index
/session stats                   # Index statistics by project
```

## How It Works

Claude Code already saves every user message to `~/.claude/history.jsonl` with session IDs, timestamps, and project paths. Session transcripts live as individual JSONL files under `~/.claude/projects/*/`. This skill indexes all of that and makes it searchable.

### Implementation

Entry point: `bun run ~/.claude/skills/session/session.ts <command> [args]`

**CRITICAL OUTPUT RULES — read before running anything:**
1. **Print the FULL command output verbatim.** Do NOT summarize, paraphrase, truncate, or reformat it. The skill handles all formatting. Your job is to relay what it prints, nothing more.
2. **Do NOT add commentary** after the output. No "What do you need?", no "Here are your sessions:", no interpretation. Just the raw output.
3. **Do NOT ask follow-up questions** after `list` or `search`. The output is self-contained.
4. **If the user references an already-shown list** (e.g., "the most recent", "the third one", "that one") — use the IDs already printed in the previous output. Do NOT re-run `list` or `show` unnecessarily.

### Naming Sessions

Users name sessions in natural language. They will NEVER type IDs. Your job is to resolve which session they mean.

**How to handle naming requests:**

1. **"Name this session X"** / **"Call this session X"** — Name the most recent session (by last activity). Run: `session.ts name "<name>"`
2. **"Name the session where I worked on the clinic bot"** — First search (`session.ts search "clinic bot"`), identify the right session from results, then name it by ID (`session.ts name <id> "<name>"`). The user never sees or types the ID — you resolve it.
3. **"Name my last session X"** — Run: `session.ts name "<name>"` (defaults to most recent by last activity)
4. **After `/session list`**, user says **"name the third one X"** — You already have the list output with IDs. Use the ID from the third entry.
5. **"Clear the name from X"** / **"Unname the clinic bot session"** — Search to find it, then run: `session.ts unname <id>`. Or `session.ts unname` to clear the most recent.

**Key rules:**
- The user NEVER types or sees session IDs. You handle all ID resolution behind the scenes.
- Names are 1-50 characters. If the user gives something longer, ask them to shorten it.
- Named sessions show as `Name — summary` in list view and `Name: X` in detail view.
- Names are searchable — `/session search "Vault Reorg"` finds named sessions with highest relevance.
- Names can be cleared with `unname` — this removes the name but preserves the AI summary.
