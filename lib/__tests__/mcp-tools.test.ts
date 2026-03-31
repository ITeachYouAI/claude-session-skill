import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { SessionEntry } from "../indexer";

/**
 * Comprehensive MCP tool handler tests using InMemoryTransport.
 *
 * Strategy: stand up a Server with the SAME handler logic as create-server.ts,
 * but inject mock data directly instead of calling real buildIndex/nameSession.
 * This avoids mock.module pollution that bleeds into other test files.
 *
 * The handlers replicate the exact switch/case logic from create-server.ts
 * so we're testing the protocol layer + handler behavior, while the
 * underlying business logic (indexer, search, format) is tested by their
 * own dedicated test suites.
 */

// ─── Fixtures ──────────────────────────────────────────────────────────

function makeSession(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    id: "aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb",
    name: "",
    project: "YNG/02_projects/test-project",
    projectDir: "-Users-tim-YNG-02_projects-test-project",
    topic: "- Set up test infrastructure\n- Fixed flaky CI pipeline\n- Added retry logic to API calls",
    firstMessage: "Let's set up the test infrastructure",
    lastMessage: "All tests passing now",
    allMessages: "Let's set up the test infrastructure ... All tests passing now",
    messageCount: 42,
    firstTimestamp: 1709500000000,
    lastTimestamp: 1709586400000,
    cwd: "/Users/tim/YNG/02_projects/test-project",
    gitBranch: "feat/testing",
    ...overrides,
  };
}

function makeSession2(): SessionEntry {
  return makeSession({
    id: "cccccccc-4444-5555-6666-dddddddddddd",
    name: "auth-refactor",
    project: "YNG/02_projects/auth-service",
    topic: "- Refactored auth middleware\n- Added JWT refresh tokens",
    firstMessage: "We need to refactor the auth layer",
    lastMessage: "JWT refresh is working",
    messageCount: 18,
    firstTimestamp: 1709400000000,
    lastTimestamp: 1709486400000,
    cwd: "/Users/tim/YNG/02_projects/auth-service",
    gitBranch: "refactor/auth",
  });
}

// ─── Inline mock implementations (no mock.module) ──────────────────────

function mockResolveSession(
  sessions: SessionEntry[],
  id: string
): { ok: true; match: SessionEntry } | { ok: false; error: string } {
  const matches = sessions.filter(s => s.id === id || s.id.startsWith(id));
  if (matches.length === 0) return { ok: false, error: `No session found matching "${id}"` };
  const exact = matches.find(s => s.id === id);
  if (exact) return { ok: true, match: exact };
  if (matches.length > 1) return { ok: false, error: `Ambiguous prefix "${id}" matches ${matches.length} sessions. Provide more characters.` };
  return { ok: true, match: matches[0] };
}

function mockSearchSessions(sessions: SessionEntry[], query: string): SessionEntry[] {
  const q = query.toLowerCase();
  return sessions.filter(s =>
    s.allMessages.toLowerCase().includes(q) ||
    s.topic.toLowerCase().includes(q) ||
    s.project.toLowerCase().includes(q) ||
    (s.name || "").toLowerCase().includes(q)
  );
}

function mockFormatSessionList(sessions: SessionEntry[], _showAll: boolean): string {
  return `LIST:${sessions.length} sessions`;
}

function mockFormatSearchResults(sessions: SessionEntry[], query: string): string {
  if (sessions.length === 0) return `No sessions found matching "${query}"`;
  return `SEARCH:${sessions.length} results for "${query}"`;
}

function mockFormatSessionDetail(session: SessionEntry): string {
  return `DETAIL:${session.id}`;
}

function mockFormatStats(sessions: SessionEntry[]): string {
  return `STATS:${sessions.length} sessions`;
}

function mockMakeAutoSessionName(session: SessionEntry): string {
  return `31/03/26 04:14 ${session.firstMessage.slice(0, 18)}`;
}

// ─── Server factory with injected mocks ────────────────────────────────

interface MockDeps {
  sessions: SessionEntry[];
  nameSessionFn: (id: string, name: string) => Promise<{ ok: boolean; fullId?: string; error?: string }>;
  clearSessionNameFn: (id: string) => Promise<{ ok: boolean; fullId?: string; error?: string }>;
}

function createTestServer(deps: MockDeps): Server {
  const pkg = JSON.parse(readFileSync(join(import.meta.dir, "../../package.json"), "utf-8"));

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
          type: "object" as const,
          properties: {
            limit: { type: "number" as const, description: "Max sessions to return." },
          },
        },
      },
      {
        name: "search_sessions",
        description: "Search Claude Code sessions by keyword.",
        inputSchema: {
          type: "object" as const,
          properties: {
            query: { type: "string" as const, description: "Search query." },
          },
          required: ["query"],
        },
      },
      {
        name: "show_session",
        description: "Show detailed session information.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const, description: "Session ID." },
          },
          required: ["id"],
        },
      },
      {
        name: "name_session",
        description: "Give a session a memorable name.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const, description: "Session ID." },
            name: { type: "string" as const, description: "Name to assign." },
          },
          required: ["name"],
        },
      },
      {
        name: "autoname_session",
        description: "Generate a timestamped name from the session summary.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const, description: "Session ID." },
          },
        },
      },
      {
        name: "unname_session",
        description: "Remove the name from a session.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const, description: "Session ID." },
          },
          required: ["id"],
        },
      },
      {
        name: "session_stats",
        description: "Show session statistics by project.",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
    ],
  }));

  // Replicate the EXACT handler logic from create-server.ts but with injected deps
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "list_sessions": {
          const sessions = deps.sessions;
          const limit = typeof args?.limit === "number" ? args.limit : undefined;
          const list = limit ? sessions.slice(0, limit) : sessions;
          return {
            content: [{ type: "text", text: mockFormatSessionList(list, true) }],
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
          const sessions = deps.sessions;
          const results = mockSearchSessions(sessions, query);
          return {
            content: [{ type: "text", text: mockFormatSearchResults(results, query) }],
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
          const sessions = deps.sessions;
          const resolved = mockResolveSession(sessions, id);
          if (!resolved.ok) {
            return {
              content: [{ type: "text", text: `Error: ${resolved.error}` }],
              isError: true,
            };
          }
          return {
            content: [{ type: "text", text: mockFormatSessionDetail(resolved.match) }],
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
            const sessions = deps.sessions;
            if (sessions.length === 0) {
              return {
                content: [{ type: "text", text: "Error: No sessions found." }],
                isError: true,
              };
            }
            sessionId = sessions[0].id;
          }

          const result = await deps.nameSessionFn(sessionId, sessionName);
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

        case "autoname_session": {
          const sessions = deps.sessions;
          if (sessions.length === 0) {
            return {
              content: [{ type: "text", text: "Error: No sessions found." }],
              isError: true,
            };
          }

          const sessionId = args?.id ? String(args.id).trim() : sessions[0].id;
          const resolved = mockResolveSession(sessions, sessionId);
          if (!resolved.ok) {
            return {
              content: [{ type: "text", text: `Error: ${resolved.error}` }],
              isError: true,
            };
          }

          const generatedName = mockMakeAutoSessionName(resolved.match);
          const result = await deps.nameSessionFn(resolved.match.id, generatedName);
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
                text: `Named session ${(result.fullId ?? "").slice(0, 8)}... → "${generatedName}"`,
              },
            ],
          };
        }

        case "unname_session": {
          let sessionId: string;
          if (args?.id) {
            sessionId = String(args.id).trim();
          } else {
            const sessions = deps.sessions;
            if (sessions.length === 0) {
              return {
                content: [{ type: "text", text: "Error: No sessions found." }],
                isError: true,
              };
            }
            sessionId = sessions[0].id;
          }

          const result = await deps.clearSessionNameFn(sessionId);
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
          const sessions = deps.sessions;
          return {
            content: [{ type: "text", text: mockFormatStats(sessions) }],
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

  return server;
}

// ─── Helpers ──────────────────────────────────────────────────────────

type TextContent = { type: "text"; text: string };

function getText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as TextContent[];
  return content[0].text;
}

async function setupClientServer(deps: MockDeps) {
  const server = createTestServer(deps);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  );
  await client.connect(clientTransport);

  return { client, server };
}

// ─── Standard mock deps ────────────────────────────────────────────────

const MOCK_SESSIONS = [makeSession(), makeSession2()];

function standardDeps(): MockDeps {
  return {
    sessions: [...MOCK_SESSIONS],
    nameSessionFn: async (id: string, name: string) => {
      const match = MOCK_SESSIONS.find(s => s.id === id || s.id.startsWith(id));
      if (!match) return { ok: false, error: `No session found matching "${id}"` };
      if (name.length > 50) return { ok: false, error: `Name too long (${name.length} chars, max 50).` };
      return { ok: true, fullId: match.id };
    },
    clearSessionNameFn: async (id: string) => {
      const match = MOCK_SESSIONS.find(s => s.id === id || s.id.startsWith(id));
      if (!match) return { ok: false, error: `No session found matching "${id}"` };
      if (!match.name) return { ok: false, error: `Session ${match.id.slice(0, 8)}... has no name to clear.` };
      return { ok: true, fullId: match.id };
    },
  };
}

function emptyDeps(): MockDeps {
  return {
    sessions: [],
    nameSessionFn: async () => ({ ok: false, error: "No sessions found." }),
    clearSessionNameFn: async () => ({ ok: false, error: "No sessions found." }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("MCP tool handlers (InMemoryTransport)", () => {
  let client: Client;

  beforeEach(async () => {
    const setup = await setupClientServer(standardDeps());
    client = setup.client;
  });

  afterEach(async () => {
    await client.close();
  });

  // ── list_tools ────────────────────────────────────────────────────

  describe("list_tools", () => {
    test("returns all 7 tools", async () => {
      const result = await client.listTools();
      expect(result.tools).toHaveLength(7);
      const names = result.tools.map(t => t.name).sort();
      expect(names).toEqual([
        "autoname_session",
        "list_sessions",
        "name_session",
        "search_sessions",
        "session_stats",
        "show_session",
        "unname_session",
      ]);
    });

    test("each tool has name, description, and inputSchema", async () => {
      const result = await client.listTools();
      for (const tool of result.tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeTruthy();
        expect(tool.inputSchema.type).toBe("object");
      }
    });

    test("search_sessions requires query parameter", async () => {
      const result = await client.listTools();
      const search = result.tools.find(t => t.name === "search_sessions");
      expect(search?.inputSchema.required).toEqual(["query"]);
    });

    test("show_session requires id parameter", async () => {
      const result = await client.listTools();
      const show = result.tools.find(t => t.name === "show_session");
      expect(show?.inputSchema.required).toEqual(["id"]);
    });

    test("name_session requires name parameter", async () => {
      const result = await client.listTools();
      const nameTool = result.tools.find(t => t.name === "name_session");
      expect(nameTool?.inputSchema.required).toEqual(["name"]);
    });

    test("autoname_session has no required params", async () => {
      const result = await client.listTools();
      const tool = result.tools.find(t => t.name === "autoname_session");
      expect(tool?.inputSchema.required).toBeUndefined();
    });

    test("session_stats has no required params", async () => {
      const result = await client.listTools();
      const stats = result.tools.find(t => t.name === "session_stats");
      expect(stats?.inputSchema.required).toBeUndefined();
    });
  });

  // ── list_sessions ────────────────────────────────────────────────

  describe("list_sessions", () => {
    test("returns all sessions when no limit", async () => {
      const result = await client.callTool({
        name: "list_sessions",
        arguments: {},
      });
      expect(result.content).toHaveLength(1);
      expect(getText(result)).toBe("LIST:2 sessions");
      expect(result.isError).toBeFalsy();
    });

    test("respects limit parameter", async () => {
      const result = await client.callTool({
        name: "list_sessions",
        arguments: { limit: 1 },
      });
      expect(getText(result)).toBe("LIST:1 sessions");
    });

    test("limit=0 is treated as no-limit (0 is falsy)", async () => {
      const result = await client.callTool({
        name: "list_sessions",
        arguments: { limit: 0 },
      });
      // limit=0 is falsy in JS, so the ternary treats it as undefined
      expect(getText(result)).toBe("LIST:2 sessions");
    });

    test("limit larger than total returns all", async () => {
      const result = await client.callTool({
        name: "list_sessions",
        arguments: { limit: 100 },
      });
      expect(getText(result)).toBe("LIST:2 sessions");
    });

    test("non-numeric limit is ignored (returns all)", async () => {
      const result = await client.callTool({
        name: "list_sessions",
        arguments: { limit: "five" },
      });
      // typeof "five" !== "number", so limit is undefined
      expect(getText(result)).toBe("LIST:2 sessions");
    });
  });

  // ── search_sessions ──────────────────────────────────────────────

  describe("search_sessions", () => {
    test("returns matching sessions for a query", async () => {
      const result = await client.callTool({
        name: "search_sessions",
        arguments: { query: "test" },
      });
      expect(getText(result)).toContain("SEARCH:");
      expect(getText(result)).toContain('results for "test"');
      expect(result.isError).toBeFalsy();
    });

    test("returns no-match message when nothing found", async () => {
      const result = await client.callTool({
        name: "search_sessions",
        arguments: { query: "zzz_nonexistent_zzz" },
      });
      expect(getText(result)).toContain("No sessions found");
    });

    test("returns error when query is empty string", async () => {
      const result = await client.callTool({
        name: "search_sessions",
        arguments: { query: "" },
      });
      expect(getText(result)).toBe("Error: query is required.");
      expect(result.isError).toBe(true);
    });

    test("returns error when query is whitespace only", async () => {
      const result = await client.callTool({
        name: "search_sessions",
        arguments: { query: "   " },
      });
      expect(getText(result)).toBe("Error: query is required.");
      expect(result.isError).toBe(true);
    });

    test("searches by session name", async () => {
      const result = await client.callTool({
        name: "search_sessions",
        arguments: { query: "auth-refactor" },
      });
      expect(getText(result)).toContain("SEARCH:");
      expect(getText(result)).toContain("1 results");
    });

    test("searches by project path", async () => {
      const result = await client.callTool({
        name: "search_sessions",
        arguments: { query: "auth-service" },
      });
      expect(getText(result)).toContain("SEARCH:");
    });
  });

  // ── show_session ─────────────────────────────────────────────────

  describe("show_session", () => {
    test("returns session detail for valid full ID", async () => {
      const result = await client.callTool({
        name: "show_session",
        arguments: { id: "aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb" },
      });
      expect(getText(result)).toBe("DETAIL:aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb");
      expect(result.isError).toBeFalsy();
    });

    test("resolves partial ID (prefix match)", async () => {
      const result = await client.callTool({
        name: "show_session",
        arguments: { id: "aaaaaaaa" },
      });
      expect(getText(result)).toBe("DETAIL:aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb");
    });

    test("returns error for non-existent ID", async () => {
      const result = await client.callTool({
        name: "show_session",
        arguments: { id: "ffffffff-0000-0000-0000-ffffffffffff" },
      });
      expect(getText(result)).toContain("Error:");
      expect(getText(result)).toContain("No session found");
      expect(result.isError).toBe(true);
    });

    test("returns error when id is empty", async () => {
      const result = await client.callTool({
        name: "show_session",
        arguments: { id: "" },
      });
      expect(getText(result)).toBe("Error: id is required.");
      expect(result.isError).toBe(true);
    });

    test("returns error when id is whitespace only", async () => {
      const result = await client.callTool({
        name: "show_session",
        arguments: { id: "   " },
      });
      expect(getText(result)).toBe("Error: id is required.");
      expect(result.isError).toBe(true);
    });
  });

  // ── name_session ─────────────────────────────────────────────────

  describe("name_session", () => {
    test("names a session with explicit ID", async () => {
      const result = await client.callTool({
        name: "name_session",
        arguments: {
          id: "aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb",
          name: "my-test-session",
        },
      });
      expect(getText(result)).toContain("Named session");
      expect(getText(result)).toContain("aaaaaaaa");
      expect(getText(result)).toContain("my-test-session");
      expect(result.isError).toBeFalsy();
    });

    test("names the most recent session when no ID given", async () => {
      const result = await client.callTool({
        name: "name_session",
        arguments: { name: "recent-work" },
      });
      // Should use first session from sessions array (most recent)
      expect(getText(result)).toContain("Named session");
      expect(getText(result)).toContain("aaaaaaaa");
      expect(getText(result)).toContain("recent-work");
    });

    test("returns error when name is empty", async () => {
      const result = await client.callTool({
        name: "name_session",
        arguments: { name: "" },
      });
      expect(getText(result)).toBe("Error: name is required.");
      expect(result.isError).toBe(true);
    });

    test("returns error when name is whitespace only", async () => {
      const result = await client.callTool({
        name: "name_session",
        arguments: { name: "   " },
      });
      expect(getText(result)).toBe("Error: name is required.");
      expect(result.isError).toBe(true);
    });

    test("returns error for non-existent session ID", async () => {
      const result = await client.callTool({
        name: "name_session",
        arguments: {
          id: "deadbeef-0000-0000-0000-000000000000",
          name: "wont-work",
        },
      });
      expect(getText(result)).toContain("Error:");
      expect(getText(result)).toContain("No session found");
      expect(result.isError).toBe(true);
    });

    test("names via partial ID prefix", async () => {
      const result = await client.callTool({
        name: "name_session",
        arguments: {
          id: "cccccccc",
          name: "partial-id-test",
        },
      });
      expect(getText(result)).toContain("Named session");
      expect(getText(result)).toContain("cccccccc");
    });
  });

  // ── autoname_session ──────────────────────────────────────────────

  describe("autoname_session", () => {
    test("names the most recent session when no ID given", async () => {
      const result = await client.callTool({
        name: "autoname_session",
        arguments: {},
      });
      expect(getText(result)).toContain("Named session");
      expect(getText(result)).toContain("aaaaaaaa");
      expect(getText(result)).toContain("31/03/26 04:14");
      expect(result.isError).toBeFalsy();
    });

    test("names a session with explicit ID", async () => {
      const result = await client.callTool({
        name: "autoname_session",
        arguments: { id: "cccccccc" },
      });
      expect(getText(result)).toContain("Named session");
      expect(getText(result)).toContain("cccccccc");
      expect(getText(result)).toContain("31/03/26 04:14");
      expect(result.isError).toBeFalsy();
    });

    test("returns error for non-existent session ID", async () => {
      const result = await client.callTool({
        name: "autoname_session",
        arguments: { id: "deadbeef-0000-0000-0000-000000000000" },
      });
      expect(getText(result)).toContain("Error:");
      expect(getText(result)).toContain("No session found");
      expect(result.isError).toBe(true);
    });
  });

  // ── unname_session ───────────────────────────────────────────────

  describe("unname_session", () => {
    test("clears name from a named session", async () => {
      // Session 2 has name "auth-refactor"
      const result = await client.callTool({
        name: "unname_session",
        arguments: { id: "cccccccc-4444-5555-6666-dddddddddddd" },
      });
      expect(getText(result)).toContain("Cleared name from session");
      expect(getText(result)).toContain("cccccccc");
      expect(result.isError).toBeFalsy();
    });

    test("returns error when session has no name to clear", async () => {
      // Session 1 has no name (empty string)
      const result = await client.callTool({
        name: "unname_session",
        arguments: { id: "aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb" },
      });
      expect(getText(result)).toContain("Error:");
      expect(getText(result)).toContain("has no name to clear");
      expect(result.isError).toBe(true);
    });

    test("returns error for non-existent session ID", async () => {
      const result = await client.callTool({
        name: "unname_session",
        arguments: { id: "deadbeef-0000-0000-0000-000000000000" },
      });
      expect(getText(result)).toContain("Error:");
      expect(getText(result)).toContain("No session found");
      expect(result.isError).toBe(true);
    });

    test("works with partial ID prefix", async () => {
      const result = await client.callTool({
        name: "unname_session",
        arguments: { id: "cccccccc" },
      });
      expect(getText(result)).toContain("Cleared name from session");
    });
  });

  // ── session_stats ────────────────────────────────────────────────

  describe("session_stats", () => {
    test("returns stats for all sessions", async () => {
      const result = await client.callTool({
        name: "session_stats",
        arguments: {},
      });
      expect(getText(result)).toBe("STATS:2 sessions");
      expect(result.isError).toBeFalsy();
    });

    test("returns single text content block", async () => {
      const result = await client.callTool({
        name: "session_stats",
        arguments: {},
      });
      const content = result.content as TextContent[];
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe("text");
    });
  });

  // ── Error handling ───────────────────────────────────────────────

  describe("error handling", () => {
    test("all error responses include isError: true", async () => {
      const searchResult = await client.callTool({
        name: "search_sessions",
        arguments: { query: "" },
      });
      expect(searchResult.isError).toBe(true);

      const showResult = await client.callTool({
        name: "show_session",
        arguments: { id: "" },
      });
      expect(showResult.isError).toBe(true);

      const nameResult = await client.callTool({
        name: "name_session",
        arguments: { name: "" },
      });
      expect(nameResult.isError).toBe(true);
    });

    test("all error messages start with 'Error:'", async () => {
      const searchResult = await client.callTool({
        name: "search_sessions",
        arguments: { query: "" },
      });
      expect(getText(searchResult)).toMatch(/^Error:/);

      const showResult = await client.callTool({
        name: "show_session",
        arguments: { id: "" },
      });
      expect(getText(showResult)).toMatch(/^Error:/);
    });

    test("all successful responses have isError falsy", async () => {
      const listResult = await client.callTool({
        name: "list_sessions",
        arguments: {},
      });
      expect(listResult.isError).toBeFalsy();

      const statsResult = await client.callTool({
        name: "session_stats",
        arguments: {},
      });
      expect(statsResult.isError).toBeFalsy();
    });
  });
});

// ─── Empty state tests ──────────────────────────────────────────────

describe("MCP tool handlers (empty state)", () => {
  let client: Client;

  beforeEach(async () => {
    const setup = await setupClientServer(emptyDeps());
    client = setup.client;
  });

  afterEach(async () => {
    await client.close();
  });

  test("list_sessions returns empty list", async () => {
    const result = await client.callTool({
      name: "list_sessions",
      arguments: {},
    });
    expect(getText(result)).toBe("LIST:0 sessions");
  });

  test("search_sessions returns no-match on empty index", async () => {
    const result = await client.callTool({
      name: "search_sessions",
      arguments: { query: "anything" },
    });
    expect(getText(result)).toContain("No sessions found");
  });

  test("session_stats returns empty stats", async () => {
    const result = await client.callTool({
      name: "session_stats",
      arguments: {},
    });
    expect(getText(result)).toBe("STATS:0 sessions");
  });

  test("name_session without ID errors when no sessions exist", async () => {
    const result = await client.callTool({
      name: "name_session",
      arguments: { name: "test-name" },
    });
    expect(getText(result)).toContain("Error:");
    expect(getText(result)).toContain("No sessions found");
    expect(result.isError).toBe(true);
  });

  test("unname_session without ID errors when no sessions exist", async () => {
    const result = await client.callTool({
      name: "unname_session",
      arguments: { id: "anything" },
    });
    expect(getText(result)).toContain("Error:");
    expect(result.isError).toBe(true);
  });
});

// ─── Exception handling tests ───────────────────────────────────────

describe("MCP tool handlers (exception in deps)", () => {
  let client: Client;

  beforeEach(async () => {
    const errorDeps: MockDeps = {
      sessions: [...MOCK_SESSIONS],
      nameSessionFn: async () => { throw new Error("Database connection failed"); },
      clearSessionNameFn: async () => { throw new Error("Database connection failed"); },
    };
    const setup = await setupClientServer(errorDeps);
    client = setup.client;
  });

  afterEach(async () => {
    await client.close();
  });

  test("name_session catches thrown exceptions", async () => {
    const result = await client.callTool({
      name: "name_session",
      arguments: { id: "aaaaaaaa", name: "test" },
    });
    expect(getText(result)).toContain("Error: Database connection failed");
    expect(result.isError).toBe(true);
  });

  test("unname_session catches thrown exceptions", async () => {
    const result = await client.callTool({
      name: "unname_session",
      arguments: { id: "aaaaaaaa" },
    });
    expect(getText(result)).toContain("Error: Database connection failed");
    expect(result.isError).toBe(true);
  });
});
