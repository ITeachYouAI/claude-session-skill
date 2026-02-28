# claude-session-skill

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill for searching, browsing, and naming past sessions. Indexes all session history and generates AI summaries so you can find any session by keyword, project, or name.

This package ships two ways to use the same session index:

- **Claude Code skill** — install via `git clone`, use `/session` commands directly in Claude Code
- **MCP server** — install via `npm`, connect any MCP-compatible client (Claude Desktop, Cursor, etc.)

Both read from the same `~/.claude/` session data. Use whichever fits your workflow.

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

## Resuming sessions

Every session view (list, search, detail) prints a ready-to-run resume command:

```
Resume:   cd /path/to/project && claude --resume <session-id>
```

**Why the `cd`?** `claude --resume` is directory-scoped — it only searches for sessions stored under the project folder matching your *current* working directory. Running it from the wrong directory returns `No conversation found` even with a valid session ID. Always run the full `cd ... && claude --resume ...` command as printed.

## MCP Server

`claude-session-skill` ships a Model Context Protocol (MCP) server so any MCP-compatible client (Claude Desktop, Cursor, etc.) can search sessions without using the CLI skill.

### Install (via npm)

```bash
npm install -g claude-session-skill
# or run without installing:
bunx claude-session-mcp
```

### Claude Desktop config

```json
{
  "mcpServers": {
    "claude-session": {
      "command": "bunx",
      "args": ["claude-session-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "<your-key>"
      }
    }
  }
}
```

Or with the global install:

```json
{
  "mcpServers": {
    "claude-session": {
      "command": "claude-session-mcp"
    }
  }
}
```

### Available tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list_sessions` | `limit?: number` | List recent sessions with AI summaries |
| `search_sessions` | `query: string` | Search by keyword or quoted phrase |
| `show_session` | `id: string` | Detailed view of a specific session |
| `name_session` | `id?: string, name: string` | Assign a memorable name to a session |
| `unname_session` | `id?: string` | Remove a session's name |
| `session_stats` | — | Statistics broken down by project |

### Verify with MCP Inspector

```bash
bunx @modelcontextprotocol/inspector bun mcp-server.ts
```

## File structure

```
session.ts              # CLI entry point
mcp-server.ts           # MCP server entry point (6 tools)
lib/
  indexer.ts            # Index builder, summarizer, name persistence
  search.ts             # Weighted keyword search
  format.ts             # Terminal output formatting
  __tests__/            # Unit tests (bun:test)
dist/                   # Built Node-compatible bundles (gitignored)
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
