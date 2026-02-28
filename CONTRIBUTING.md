# Contributing to /session

Thanks for your interest in contributing! This guide will help you get started.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Report unacceptable behavior to engineering@iteachyouai.com.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) v1.0+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed
- `ANTHROPIC_API_KEY` environment variable set

### Setup

```bash
git clone https://github.com/ITeachYouAI/claude-session-skill.git
cd claude-session-skill
bun run session.ts help
```

No `npm install` needed — this project has zero dependencies.

### Running Type Checks

```bash
bun x tsc --noEmit
```

## How to Contribute

### Reporting Bugs

Open a [bug report](https://github.com/ITeachYouAI/claude-session-skill/issues/new?template=bug_report.md) with:

- Steps to reproduce
- Expected vs actual behavior
- Your Bun version (`bun --version`) and OS
- Relevant error output

### Suggesting Features

Open a [feature request](https://github.com/ITeachYouAI/claude-session-skill/issues/new?template=feature_request.md) describing:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

### Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run type checks: `bun x tsc --noEmit`
5. Run the skill to verify it works: `bun run session.ts list`
6. Commit with a clear message (see [Commit Messages](#commit-messages))
7. Push to your fork and open a pull request

### Commit Messages

Use clear, imperative-tense messages:

```
Add fuzzy matching to session search
Fix crash when history.jsonl is empty
Update README with new CLI options
```

## Architecture

```
session.ts          # CLI entry point — dispatches commands
lib/
  indexer.ts        # Three-phase index builder + Haiku summarizer
  search.ts         # Weighted keyword search with recency boost
  format.ts         # Terminal output formatting
data/               # Auto-generated, gitignored
  index.json        # Cached index (invalidates on history change)
  summaries.json    # Persistent LLM summaries
```

### Key Design Decisions

- **Zero dependencies** — Only Bun built-ins + `fetch` for the Anthropic API. No package.json deps.
- **Bun-only** — Uses `Bun.file()` and `Bun.write()`. Not compatible with Node.js.
- **Cache-first** — Index rebuilds only when `history.jsonl` mtime or session file count changes.
- **Summaries persist separately** — `summaries.json` survives index rebuilds so you don't re-summarize old sessions.

## Style Guide

- TypeScript with strict types
- No `any` types unless interfacing with external JSON
- Prefer `const` over `let`
- Handle errors gracefully — never crash on malformed session data
- Keep functions small and focused

## Questions?

Open an issue or reach out at engineering@iteachyouai.com.
