# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.8] - 2026-03-31

### Added

- **`/session autoname`** — generates session titles from summaries with a `dd/mm/yy HH:MM` prefix
- **`autoname_session` MCP tool** — mirrors the CLI autoname behavior for MCP clients

### Changed

- **README / SKILL docs** — clarified that “name + summarize” should generate timestamped titles
- **Tests** — added coverage for timestamped autoname formatting and MCP tool exposure

## [1.1.7] - 2026-03-03

### Added

- **deploy.sh** — script to sync repo to `~/.claude/skills/session/`
- **Dynamic MCP server version** — `mcp-server.ts` now reads version from `package.json` at runtime instead of a hardcoded string

### Fixed

- **Session sort order** — all session views (list, search, detail) now sort by most recent first
- **Resume command includes `cd`** — list, search, and detail views now print `cd /path && claude --resume <id>` since `--resume` is directory-scoped
- **Raw session IDs in output** — list view shows raw IDs and enforces verbatim output in the skill to prevent Claude from truncating them
- **Code fence wrapping** — output wrapped in code fences to prevent Claude from reformatting session IDs
- **Char limit for summaries** — updated from 4,000 to 6,000 characters sent to summarization API

### Changed

- **CONTRIBUTING.md** — corrected "zero dependencies" claim; project depends on `@modelcontextprotocol/sdk` and `zod`
- **SECURITY.md** — updated character count to match actual implementation (6,000 chars)
- **README** — rewritten with clean OSS boilerplate; added `cd` requirement explanation for `--resume`; clarified skill vs MCP usage

## [1.1.0] - 2026-02-28

### Added

- **MCP server** (`mcp-server.ts`) — exposes 6 tools over JSON-RPC stdio: `list_sessions`, `search_sessions`, `show_session`, `name_session`, `unname_session`, `session_stats`
- **`resolveSession()`** — extracted partial-ID resolution into shared utility used by CLI and MCP server
- **`dist/` build outputs** — `bun build --target node` produces Node-compatible bundles for `npx` usage
- **`bin` entries** — `claude-session` and `claude-session-mcp` binaries for npm install
- **~42 new tests** — I/O tests for `buildIndex`, `nameSession`, `clearSessionName`, `resolveSession`, `summarizeSession`; format edge cases for `formatDate(0)` and Unicode truncation

### Changed

- Ported all `Bun.file()` / `Bun.write()` calls to Node-compatible `fs/promises` (`readFile`, `writeFile`, `open`)
- Lock file now uses `open(path, 'wx')` instead of Bun-specific `{ createNew: true }` flag
- `nameSession` and `clearSessionName` now use shared `resolveSession()` instead of inline filter logic

## [1.0.0] - 2026-02-26

### Added

- Three-phase index builder: history parsing, session file enrichment, LLM summarization
- Weighted keyword search with quoted phrase support and recency boosting
- Session listing with AI-generated one-line summaries via Claude Haiku
- Detailed session view with project, branch, timestamps, and message counts
- Per-project statistics breakdown
- Persistent summary caching (survives index rebuilds)
- Auto-invalidating index cache based on history mtime and session file count
- Partial session ID matching (first 8 characters)
- Cross-project session discovery (indexes all `~/.claude/projects/*/`)
- Claude Code SKILL.md integration for `/session` command

### Fixed

- Strip markdown and JSON formatting artifacts from Haiku summaries

[1.1.7]: https://github.com/ITeachYouAI/claude-session-skill/releases/tag/v1.1.7
[1.1.0]: https://github.com/ITeachYouAI/claude-session-skill/releases/tag/v1.1.0
[1.0.0]: https://github.com/ITeachYouAI/claude-session-skill/releases/tag/v1.0.0
