#!/usr/bin/env bun

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { buildIndex, nameSession, clearSessionName, resolveSession } from "./lib/indexer";
import { searchSessions } from "./lib/search";
import {
  formatSessionList,
  formatSearchResults,
  formatSessionDetail,
  formatStats,
} from "./lib/format";

// NEVER use console.log() — corrupts JSON-RPC stdio stream.
// Only process.stderr (debug) is safe.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8"));

const server = new Server(
  { name: "claude-session", version: pkg.version },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_sessions",
      description: "List recent Claude Code sessions with AI-generated summaries, sorted by last activity.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max sessions to return. Defaults to all sessions.",
          },
        },
      },
    },
    {
      name: "search_sessions",
      description: "Search Claude Code sessions by keyword, project path, topic, or quoted phrase.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query. Supports quoted phrases for exact matches, e.g. \"auth bug\".",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "show_session",
      description: "Show detailed information about a specific session: project, branch, timestamps, message count, and AI summary.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Full or partial session ID (first 8+ characters are sufficient).",
          },
        },
        required: ["id"],
      },
    },
    {
      name: "name_session",
      description: "Give a session a memorable name for easy recall. Defaults to the most recent session if no ID is provided.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Session ID or prefix. If omitted, names the most recent session.",
          },
          name: {
            type: "string",
            description: "Name to assign (max 50 characters).",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "unname_session",
      description: "Remove the name from a session. Defaults to the most recent session if no ID is provided.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Session ID or prefix. If omitted, clears the name of the most recent session.",
          },
        },
        required: ["id"],
      },
    },
    {
      name: "session_stats",
      description: "Show session statistics broken down by project: session count, message count, and last activity.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_sessions": {
        const sessions = await buildIndex();
        const limit = typeof args?.limit === "number" ? args.limit : undefined;
        const list = limit ? sessions.slice(0, limit) : sessions;
        return {
          content: [{ type: "text", text: formatSessionList(list, true) }],
        };
      }

      case "search_sessions": {
        const query = String(args?.query ?? "").trim();
        if (!query) {
          return {
            content: [{ type: "text", text: "Error: query is required." }],
            isError: true,
          };
        }
        const sessions = await buildIndex();
        const results = searchSessions(sessions, query);
        return {
          content: [{ type: "text", text: formatSearchResults(results, query) }],
        };
      }

      case "show_session": {
        const id = String(args?.id ?? "").trim();
        if (!id) {
          return {
            content: [{ type: "text", text: "Error: id is required." }],
            isError: true,
          };
        }
        const sessions = await buildIndex();
        const resolved = resolveSession(sessions, id);
        if (!resolved.ok) {
          return {
            content: [{ type: "text", text: `Error: ${resolved.error}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: formatSessionDetail(resolved.match) }],
        };
      }

      case "name_session": {
        const sessionName = String(args?.name ?? "").trim();
        if (!sessionName) {
          return {
            content: [{ type: "text", text: "Error: name is required." }],
            isError: true,
          };
        }

        let sessionId: string;
        if (args?.id) {
          sessionId = String(args.id).trim();
        } else {
          // Default to most recent session
          const sessions = await buildIndex();
          if (sessions.length === 0) {
            return {
              content: [{ type: "text", text: "Error: No sessions found." }],
              isError: true,
            };
          }
          sessionId = sessions[0].id;
        }

        const result = await nameSession(sessionId, sessionName);
        if (!result.ok) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `Named session ${(result.fullId ?? "").slice(0, 8)}... → "${sessionName}"`,
            },
          ],
        };
      }

      case "unname_session": {
        let sessionId: string;
        if (args?.id) {
          sessionId = String(args.id).trim();
        } else {
          const sessions = await buildIndex();
          if (sessions.length === 0) {
            return {
              content: [{ type: "text", text: "Error: No sessions found." }],
              isError: true,
            };
          }
          sessionId = sessions[0].id;
        }

        const result = await clearSessionName(sessionId);
        if (!result.ok) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `Cleared name from session ${(result.fullId ?? "").slice(0, 8)}...`,
            },
          ],
        };
      }

      case "session_stats": {
        const sessions = await buildIndex();
        return {
          content: [{ type: "text", text: formatStats(sessions) }],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Error: Unknown tool "${name}"` }],
          isError: true,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
