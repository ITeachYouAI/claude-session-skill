# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/ITeachYouAI/claude-session-skill/releases/tag/v1.0.0
