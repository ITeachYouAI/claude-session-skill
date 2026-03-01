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

  test("name match is included even without topic match", () => {
    const sessions = [
      makeSession({ id: "a", name: "", topic: "deploy pipeline" }),
      makeSession({ id: "b", name: "Deploy Fix", topic: "unrelated" }),
    ];
    const results = searchSessions(sessions, "deploy");
    expect(results.map((r) => r.id)).toContain("a");
    expect(results.map((r) => r.id)).toContain("b");
  });

  test("topic match is included", () => {
    const sessions = [
      makeSession({ id: "a", topic: "unrelated", allMessages: "deploy fix" }),
      makeSession({ id: "b", topic: "deploy pipeline", allMessages: "other stuff" }),
    ];
    const results = searchSessions(sessions, "deploy");
    expect(results.map((r) => r.id)).toContain("a");
    expect(results.map((r) => r.id)).toContain("b");
  });

  test("firstMessage and lastMessage matches are both included", () => {
    const sessions = [
      makeSession({ id: "a", firstMessage: "unrelated", lastMessage: "fixed the deploy" }),
      makeSession({ id: "b", firstMessage: "fix the deploy", lastMessage: "unrelated" }),
    ];
    const results = searchSessions(sessions, "deploy");
    expect(results.map((r) => r.id)).toContain("a");
    expect(results.map((r) => r.id)).toContain("b");
  });

  test("quoted phrase filters to exact matches only", () => {
    const sessions = [
      makeSession({ id: "a", topic: "deploy fix" }),
      makeSession({ id: "b", topic: "fix deploy issue" }),
    ];
    const results = searchSessions(sessions, '"deploy fix"');
    expect(results.map((r) => r.id)).toContain("a");
    expect(results.map((r) => r.id)).not.toContain("b");
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

  test("results are ordered most recent first", () => {
    const now = Date.now();
    const sessions = [
      makeSession({ id: "old", topic: "deploy", lastTimestamp: now - 86400000 * 30 }),
      makeSession({ id: "recent", topic: "deploy", lastTimestamp: now - 3600000 }),
    ];
    const results = searchSessions(sessions, "deploy");
    expect(results[0].id).toBe("recent");
    expect(results[1].id).toBe("old");
  });

  test("handles multiple search tokens — all matching sessions included", () => {
    const now = Date.now();
    const sessions = [
      makeSession({ id: "a", topic: "fix login bug in auth", lastTimestamp: now - 1000 }),
      makeSession({ id: "b", topic: "fix deploy pipeline", lastTimestamp: now - 2000 }),
      makeSession({ id: "c", topic: "login page redesign", lastTimestamp: now - 3000 }),
    ];
    const results = searchSessions(sessions, "fix login");
    // a and c both match ("fix login" shares tokens); b matches "fix"
    const ids = results.map((r) => r.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(ids).toContain("c");
    // All ordered most recent first
    expect(results[0].id).toBe("a");
  });

  test("returns results sorted by most recent first regardless of score", () => {
    const now = Date.now();
    const sessions = [
      makeSession({ id: "a", topic: "deploy", lastTimestamp: now - 86400000 * 10 }),
      makeSession({ id: "b", topic: "deploy", lastTimestamp: now - 86400000 * 5 }),
    ];
    const results = searchSessions(sessions, "deploy");
    expect(results[0].id).toBe("b");
    expect(results[1].id).toBe("a");
  });
});
