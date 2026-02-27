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
---

# Session Tracker Skill

## Usage

```
/session <query>                 # Search sessions by keyword
/session list                    # Show 20 most recent sessions
/session list --all              # Show all sessions
/session show <id>               # Full details (supports partial IDs)
/session name <name>             # Name the current/most recent session
/session name <id> <name>        # Name a specific session by ID
/session rebuild                 # Force rebuild the index
/session stats                   # Index statistics by project
```

## How It Works

Claude Code already saves every user message to `~/.claude/history.jsonl` with session IDs, timestamps, and project paths. Session transcripts live as individual JSONL files under `~/.claude/projects/*/`. This skill indexes all of that and makes it searchable.

### Implementation

Entry point: `bun run ~/.claude/skills/session/session.ts <command> [args]`

Run the command above and present the output to the user. The tool handles all indexing, searching, and formatting internally.

### Naming Sessions

Users name sessions in natural language. They will NEVER type IDs. Your job is to resolve which session they mean.

**How to handle naming requests:**

1. **"Name this session X"** / **"Call this session X"** — Name the current session. Run: `session.ts name "<name>"`
2. **"Name the session where I worked on the clinic bot"** — First search (`session.ts search "clinic bot"`), identify the right session from results, then name it by ID (`session.ts name <id> "<name>"`). The user never sees or types the ID — you resolve it.
3. **"Name my last session X"** — Run: `session.ts name "<name>"` (defaults to most recent)
4. **After `/session list`**, user says **"name the third one X"** — You already have the list output with IDs. Use the ID from the third entry.

**Key rules:**
- The user NEVER types or sees session IDs. You handle all ID resolution behind the scenes.
- Names are 1-50 characters. If the user gives something longer, ask them to shorten it.
- Named sessions show as `Name — summary` in list view and `Name: X` in detail view.
- Names are searchable — `/session search "Vault Reorg"` finds named sessions with highest relevance.
