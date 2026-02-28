import { describe, test, expect } from "bun:test";
import {
  formatSessionList,
  formatSearchResults,
  formatSessionDetail,
  formatStats,
} from "../format";
import type { SessionEntry } from "../indexer";

function makeSession(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    id: "abcdef1234567890",
    name: "",
    project: "my-project",
    projectDir: "",
    topic: "- Fixed authentication bug in login flow",
    firstMessage: "Fix the auth bug",
    lastMessage: "Done, all tests pass",
    allMessages: "Fix the auth bug",
    messageCount: 15,
    firstTimestamp: 1709000000000,
    lastTimestamp: 1709001000000,
    cwd: "/Users/tim/projects/my-project",
    gitBranch: "main",
    ...overrides,
  };
}

describe("formatSessionList", () => {
  test("shows count header", () => {
    const sessions = [makeSession()];
    const output = formatSessionList(sessions, true);
    expect(output).toContain("1 session(s)");
  });

  test("truncates to 20 by default", () => {
    const sessions = Array.from({ length: 25 }, (_, i) =>
      makeSession({ id: `session-${i.toString().padStart(16, "0")}` })
    );
    const output = formatSessionList(sessions, false);
    expect(output).toContain("25 sessions");
    expect(output).toContain("--all");
  });

  test("shows all when requested", () => {
    const sessions = Array.from({ length: 25 }, (_, i) =>
      makeSession({ id: `session-${i.toString().padStart(16, "0")}` })
    );
    const output = formatSessionList(sessions, true);
    expect(output).toContain("25 session(s)");
  });

  test("shows full session ID", () => {
    const output = formatSessionList([makeSession()], true);
    expect(output).toContain("abcdef1234567890");
  });

  test("shows message count", () => {
    const output = formatSessionList([makeSession()], true);
    expect(output).toContain("15 msgs");
  });

  test("shows name with summary when named", () => {
    const output = formatSessionList([makeSession({ name: "Auth Fix" })], true);
    expect(output).toContain("Auth Fix");
  });
});

describe("formatSearchResults", () => {
  test("shows no results message", () => {
    const output = formatSearchResults([], "deploy");
    expect(output).toContain('No sessions found matching "deploy"');
  });

  test("shows result count", () => {
    const sessions = [makeSession()];
    const output = formatSearchResults(sessions, "auth");
    expect(output).toContain('1 session(s) matching "auth"');
  });

  test("shows top 15 max", () => {
    const sessions = Array.from({ length: 20 }, () => makeSession());
    const output = formatSearchResults(sessions, "test");
    expect(output).toContain("showing 15");
  });

  test("shows git branch when present", () => {
    const output = formatSearchResults([makeSession({ gitBranch: "feat/login" })], "auth");
    expect(output).toContain("feat/login");
  });
});

describe("formatSessionDetail", () => {
  test("shows full session ID", () => {
    const output = formatSessionDetail(makeSession());
    expect(output).toContain("abcdef1234567890");
  });

  test("shows project", () => {
    const output = formatSessionDetail(makeSession());
    expect(output).toContain("my-project");
  });

  test("shows cwd", () => {
    const output = formatSessionDetail(makeSession());
    expect(output).toContain("/Users/tim/projects/my-project");
  });

  test("shows git branch", () => {
    const output = formatSessionDetail(makeSession());
    expect(output).toContain("main");
  });

  test("shows message count", () => {
    const output = formatSessionDetail(makeSession());
    expect(output).toContain("15");
  });

  test("shows name when present", () => {
    const output = formatSessionDetail(makeSession({ name: "My Session" }));
    expect(output).toContain("My Session");
  });

  test("omits name line when empty", () => {
    const output = formatSessionDetail(makeSession({ name: "" }));
    expect(output).not.toContain("Name:");
  });

  test("omits branch when empty", () => {
    const output = formatSessionDetail(makeSession({ gitBranch: "" }));
    expect(output).not.toContain("Branch:");
  });
});

describe("formatStats", () => {
  test("shows session and project count", () => {
    const sessions = [
      makeSession({ project: "app-a" }),
      makeSession({ project: "app-a" }),
      makeSession({ project: "app-b" }),
    ];
    const output = formatStats(sessions);
    expect(output).toContain("3 sessions across 2 projects");
  });

  test("sorts by session count descending", () => {
    const sessions = [
      makeSession({ project: "small" }),
      makeSession({ project: "big" }),
      makeSession({ project: "big" }),
      makeSession({ project: "big" }),
    ];
    const output = formatStats(sessions);
    const bigIdx = output.indexOf("big");
    const smallIdx = output.indexOf("small");
    expect(bigIdx).toBeLessThan(smallIdx);
  });
});
