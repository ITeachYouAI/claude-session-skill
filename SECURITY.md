# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Data Access

This tool reads data from your local `~/.claude/` directory, including:

- `~/.claude/history.jsonl` — Session metadata (timestamps, project paths, user messages)
- `~/.claude/projects/*/` — Full session transcript files

**This data may contain sensitive information** such as code snippets, file paths, API discussions, and other content from your Claude Code sessions.

### API Key Usage

The tool uses your `ANTHROPIC_API_KEY` to call the Claude Haiku API for generating session summaries. The API key is read from your environment and sent only to `api.anthropic.com`. It is never logged, cached, or transmitted elsewhere.

### What Gets Sent to the API

When generating summaries, the tool sends up to 4,000 characters of conversation content (user and assistant messages) per session to the Claude Haiku API. This happens:

- On first run (for all existing sessions)
- Incrementally for new sessions on subsequent runs
- When you explicitly run `rebuild`

Summaries are cached locally in `data/summaries.json` so each session is only summarized once.

### Local Storage

All cached data stays on your machine:

- `data/index.json` — Parsed session index
- `data/summaries.json` — LLM-generated summaries

These files are gitignored and never leave your machine.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue**
2. Email **engineering@iteachyouai.com** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
3. You will receive a response within 48 hours
4. A fix will be prioritized and released as soon as possible

## Security Best Practices for Users

- Keep your `ANTHROPIC_API_KEY` in environment variables, not in code
- Do not commit the `data/` directory (it's gitignored by default)
- Review `data/summaries.json` if you're concerned about what was sent to the API — it contains only the one-line summaries returned by Haiku, not the input data
