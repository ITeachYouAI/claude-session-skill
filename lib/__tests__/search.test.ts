import { describe, test, expect } from "bun:test";
import { searchSessions } from "../search";
import type { SessionEntry } from "../indexer";

function makeSession(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    id: "test-" + Math.random().toString(36).slice(2, 10),
    name: "",
    project: "",
    projectDir: "",
    topic: "",
    firstMessage: "",
    lastMessage: "",
    allMessages: "",
    messageCount: 1,
    firstTimestamp: Date.now() - 86400000 * 7,
    lastTimestamp: Date.now() - 86400000 * 7,
    cwd: "",
    gitBranch: "",
    ...overrides,
  };
}

describe("searchSessions", () => {
  test("returns empty array for no matches", () => {
    const sessions = [makeSession({ topic: "fix login bug" })];
    const results = searchSessions(sessions, "deploy");
    expect(results).toHaveLength(0);
  });

  test("returns all sessions for empty query tokens", () => {
    const sessions = [
      makeSession({ topic: "fix login" }),
      makeSession({ topic: "add feature" }),
    ];
    const results = searchSessions(sessions, "a");
    expect(results).toHaveLength(2);
  });

  test("matches on topic", () => {
    const sessions = [
      makeSession({ id: "a", topic: "deploy pipeline setup" }),
      makeSession({ id: "b", topic: "unrelated work" }),
    ];
    const results = searchSessions(sessions, "deploy");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("a");
  });

  test("ranks name matches highest", () => {
    const sessions = [
      makeSession({ id: "a", name: "", topic: "deploy pipeline" }),
      makeSession({ id: "b", name: "Deploy Fix", topic: "unrelated" }),
    ];
    const results = searchSessions(sessions, "deploy");
    expect(results[0].id).toBe("b");
  });

  test("ranks topic matches above allMessages matches", () => {
    const sessions = [
      makeSession({ id: "a", topic: "unrelated", allMessages: "deploy fix" }),
      makeSession({ id: "b", topic: "deploy pipeline", allMessages: "other stuff" }),
    ];
    const results = searchSessions(sessions, "deploy");
    expect(results[0].id).toBe("b");
  });

  test("ranks firstMessage matches above lastMessage", () => {
    const sessions = [
      makeSession({ id: "a", firstMessage: "unrelated", lastMessage: "fixed the deploy" }),
      makeSession({ id: "b", firstMessage: "fix the deploy", lastMessage: "unrelated" }),
    ];
    const results = searchSessions(sessions, "deploy");
    expect(results[0].id).toBe("b");
  });

  test("supports quoted phrase matching", () => {
    const sessions = [
      makeSession({ id: "a", topic: "deploy fix" }),
      makeSession({ id: "b", topic: "fix deploy issue" }),
    ];
    const results = searchSessions(sessions, '"deploy fix"');
    expect(results[0].id).toBe("a");
  });

  test("matches on project path", () => {
    const sessions = [
      makeSession({ id: "a", project: "createsocial", topic: "something" }),
      makeSession({ id: "b", project: "looksmaxx", topic: "something else" }),
    ];
    const results = searchSessions(sessions, "createsocial");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("a");
  });

  test("matches on cwd", () => {
    const sessions = [
      makeSession({ id: "a", cwd: "/Users/tim/projects/myapp", topic: "work" }),
      makeSession({ id: "b", cwd: "/Users/tim/other", topic: "work" }),
    ];
    const results = searchSessions(sessions, "myapp");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("a");
  });

  test("applies recency boost for sessions within 1 day", () => {
    const now = Date.now();
    const sessions = [
      makeSession({ id: "old", topic: "deploy", lastTimestamp: now - 86400000 * 30 }),
      makeSession({ id: "recent", topic: "deploy", lastTimestamp: now - 3600000 }),
    ];
    const results = searchSessions(sessions, "deploy");
    expect(results[0].id).toBe("recent");
  });

  test("handles multiple search tokens", () => {
    const sessions = [
      makeSession({ id: "a", topic: "fix login bug in auth" }),
      makeSession({ id: "b", topic: "fix deploy pipeline" }),
      makeSession({ id: "c", topic: "login page redesign" }),
    ];
    const results = searchSessions(sessions, "fix login");
    expect(results[0].id).toBe("a");
  });

  test("returns results sorted by score then recency", () => {
    const now = Date.now();
    const sessions = [
      makeSession({ id: "a", topic: "deploy", lastTimestamp: now - 86400000 * 10 }),
      makeSession({ id: "b", topic: "deploy", lastTimestamp: now - 86400000 * 5 }),
    ];
    const results = searchSessions(sessions, "deploy");
    expect(results[0].id).toBe("b");
  });
});
