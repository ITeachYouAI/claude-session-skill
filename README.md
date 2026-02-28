# claude-session-skill

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill for searching, browsing, and naming past sessions. Indexes all session history and generates AI summaries so you can find any session by keyword, project, or name.

## Requirements

- [Bun](https://bun.sh) runtime
- Claude Code CLI
- `ANTHROPIC_API_KEY` environment variable

## Installation

```bash
git clone https://github.com/ITeachYouAI/claude-session-skill.git ~/.claude/skills/session
bun run ~/.claude/skills/session/session.ts rebuild
```

Claude Code discovers the skill automatically via `SKILL.md` triggers. Open any session and type `/session list`.

## Usage

```
/session list                    # Show 20 most recent sessions
/session list --all              # Show all sessions
/session show <id>               # Show full session details (partial IDs work)
/session name <name>             # Name the most recent session
/session name <id> <name>        # Name a specific session by ID
/session unname [<id>]           # Clear a session's name
/session search <query>          # Search by keyword
/session <query>                 # Shorthand for search
/session rebuild                 # Rebuild the index
/session stats                   # Stats by project
```

## Naming sessions

Session naming is handled via natural language — you never type or see session IDs directly. Claude resolves which session you mean.

| Input | Behavior |
|---|---|
| "Name this session `<name>`" | Names the most recent session |
| "Name the session where I did `<thing>`" | Claude searches, finds it, names it |
| After `/session list`: "name the second one `<name>`" | Claude uses the ID from the list output |
| "Unname the `<name>` session" | Claude searches, finds it, clears the name |

Names are 1–50 characters. Named sessions rank highest in search results. Clearing a name with `unname` preserves the AI summary.

## How it works

### Index build

1. Parse `~/.claude/history.jsonl` for session IDs, timestamps, and project paths
2. Scan `~/.claude/projects/*/` session files for conversation content, working directory, and git branch
3. Generate summaries via Claude Haiku (5 bullet points per session, 10 concurrent requests)

### Caching

- Index cache invalidates when `history.jsonl` changes or any session file is modified
- Summary cache persists across rebuilds — each session is summarized once
- Cached lookups: ~30ms

### Search scoring

| Signal | Weight |
|---|---|
| Name match | 15 |
| Summary match | 12 |
| First message match | 10 |
| Last message match | 5 |
| Project/path match | 3 |
| All messages match | 2 |
| Quoted phrase | 2× multiplier |
| Within 24 hours | 1.5× recency boost |
| Within 7 days | 1.2× recency boost |

## File structure

```
session.ts              # CLI entry point
lib/
  indexer.ts            # Index builder, summarizer, name persistence
  search.ts             # Weighted keyword search
  format.ts             # Terminal output formatting
  __tests__/            # Unit tests (bun:test)
SKILL.md                # Skill manifest and Claude instructions
data/                   # Auto-generated, gitignored
  index.json            # Cached session index
  summaries.json        # Persistent AI summaries
  names.json            # User-assigned session names
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | required | Used for session summarization |
| `SESSION_SUMMARY_MODEL` | `claude-haiku-4-5-20251001` | Model used for summarization |
| `SESSION_DEBUG` | unset | Enable debug logging to stderr |

## Development

```bash
git clone https://github.com/ITeachYouAI/claude-session-skill.git
cd claude-session-skill
bun install
bun test
bun x tsc --noEmit
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
