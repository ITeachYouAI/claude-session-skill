# claude-session-skill

A Claude Code skill that indexes, searches, and names your Claude Code sessions. Every session you've ever had becomes searchable by keyword, project, or custom name.

## What it does

Claude Code stores session transcripts as JSONL files but provides no way to search them. This skill:

- **Indexes** all sessions from `~/.claude/history.jsonl` and `~/.claude/projects/*/`
- **Summarizes** each session using Claude Haiku (5 bullet points of what was done)
- **Searches** by keyword across session content, summaries, project names, and custom names
- **Names** sessions so you can find them instantly ("Vault Reorg", "Clinic Bot Build") instead of scanning AI summaries

## Usage

```
/session list                    # Show 20 most recent sessions
/session list --all              # Show all sessions
/session show <id>               # Full details (partial IDs work)
/session name <name>             # Name the most recent session
/session name <id> <name>        # Name a specific session
/session unname [<id>]           # Clear a session's name
/session search <query>          # Search by keyword
/session <query>                 # Shorthand for search
/session rebuild                 # Force rebuild the index
/session stats                   # Stats by project
```

## How naming works

You speak natural language. Claude resolves which session you mean — you never type or see session IDs.

| What you say | What happens |
|---|---|
| "Name this session Vault Reorg" | Names the most recent session |
| "Call this session Infra Fix" | Same — names current session |
| "Name the session where I fixed the gateway" | Claude searches, finds it, names it by ID |
| "Name my last session Auth Refactor" | Names most recent session |
| After `/session list`: "name the third one Deploy Fix" | Claude uses the ID from the list output |
| "Unname the clinic bot session" | Claude searches, finds it, clears the name |
| "Clear the name from this session" | Clears name from most recent session |

Names display as `Name — AI summary` in list and search views:

```
cr a1b2c3d4...    42 msgs | Feb 27, 2:30 PM
  Vault Reorg — Built 10-phase reorganization system for YNG vault
  Left off: "commit and push"
```

And in detail view:

```
cr a1b2c3d4ef567890

Name:     Vault Reorg
Project:  YNG
CWD:      /Users/tim/YNG
Messages: 42
Started:  Feb 27, 2:15 PM
Last:     Feb 27, 2:30 PM

What was done:
- Built 10-phase vault reorganization system
- Moved 1.3GB videos outside git-tracked area
- Archived 13 stale projects
- Updated CLAUDE.md with new directory structure
- Committed and pushed 9 commits
```

**Rules:**
- Names are 1–50 characters. Claude will ask you to shorten if longer.
- Names are searchable — `/session search "Vault Reorg"` ranks named sessions highest.
- Clearing a name with `unname` removes the name but keeps the AI summary.

## Architecture

```
session.ts          # Entry point — command routing
lib/indexer.ts      # Index builder, name persistence, session resolution
lib/format.ts       # Output formatting (list, detail, search, stats)
lib/search.ts       # Weighted search with name/topic/message scoring
SKILL.md            # Skill manifest + Claude instructions
data/               # Runtime data (gitignored)
  index.json        # Cached session index
  summaries.json    # Haiku-generated summaries
  names.json        # User-assigned session names
```

Names are stored separately from summaries. Names never get overwritten by index rebuilds. Summaries never get overwritten by naming. Two independent data layers.

## Production hardening

- Atomic writes (temp + rename) prevent corruption on interrupted saves
- Advisory file locking on name operations prevents concurrent write corruption
- Mtime-based in-memory cache for names — avoids redundant disk reads on hot path
- Surrogate-safe string truncation — emoji and CJK characters never split mid-codepoint
- Data directory auto-created on first run
- JSON validation on load — corrupted files gracefully fall back to empty state
- Ambiguous partial IDs rejected with clear error messages
- UUID-format regex prevents false positives on hex-like session names
- Names capped at 50 characters, empty/whitespace rejected
- Stale lock detection (10s timeout) prevents deadlocks from crashed processes

## Requirements

- [Bun](https://bun.sh) runtime
- Claude Code with sessions stored in `~/.claude/`
- `ANTHROPIC_API_KEY` env var (for Haiku summarization)

## Install

```bash
git clone https://github.com/ITeachYouAI/claude-session-skill.git ~/.claude/skills/session
bun run ~/.claude/skills/session/session.ts rebuild
```

Claude Code will discover it automatically via SKILL.md triggers.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `ANTHROPIC_API_KEY` | (required) | API key for generating session summaries |
| `SESSION_SUMMARY_MODEL` | `claude-haiku-4-5-20251001` | Model used for summarization |
| `SESSION_DEBUG` | unset | Set to any value to enable debug logging to stderr |

## Development

```bash
git clone https://github.com/ITeachYouAI/claude-session-skill.git
cd claude-session-skill
bun install           # Install dev dependencies (bun-types, typescript)
bun test              # Run test suite
bun x tsc --noEmit    # Type check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full contributor guidelines.

## License

MIT
