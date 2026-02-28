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

  test("shows resume command in list view", () => {
    const output = formatSessionList([makeSession()], true);
    expect(output).toContain("cd /Users/tim/projects/my-project && claude --resume abcdef1234567890");
  });

  test("omits resume line when cwd is empty in list", () => {
    const output = formatSessionList([makeSession({ cwd: "" })], true);
    expect(output).not.toContain("claude --resume");
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

  test("shows resume command in search results", () => {
    const output = formatSearchResults([makeSession()], "auth");
    expect(output).toContain("cd /Users/tim/projects/my-project && claude --resume abcdef1234567890");
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

  test("shows resume command with cd and session id", () => {
    const output = formatSessionDetail(makeSession());
    expect(output).toContain("cd /Users/tim/projects/my-project && claude --resume abcdef1234567890");
  });

  test("omits resume line when cwd is empty", () => {
    const output = formatSessionDetail(makeSession({ cwd: "" }));
    expect(output).not.toContain("claude --resume");
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

// ── formatDate edge cases (via formatSessionList) ─────────────────────────────

describe("formatDate edge cases (via formatSessionList)", () => {
  test("ts=0 renders as 'unknown'", () => {
    const session = makeSession({ lastTimestamp: 0, firstTimestamp: 0 });
    const output = formatSessionList([session], true);
    expect(output).toContain("unknown");
  });

  test("ts=undefined-like (NaN) renders as 'unknown'", () => {
    const session = makeSession({ lastTimestamp: NaN, firstTimestamp: NaN });
    const output = formatSessionList([session], true);
    expect(output).toContain("unknown");
  });

  test("non-zero timestamp renders a real date", () => {
    const session = makeSession({ lastTimestamp: 1709000000000 });
    const output = formatSessionList([session], true);
    // Should contain a month name, not "unknown"
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    expect(months.some((m) => output.includes(m))).toBe(true);
    expect(output).not.toContain("unknown");
  });
});

// ── truncate edge cases (via formatSessionList label) ─────────────────────────

describe("truncate edge cases (via formatSessionList)", () => {
  test("emoji string truncated by code points, not bytes", () => {
    // 4-byte emoji × 35 = 140 bytes but 35 code points → fits in max=100
    const emojiStr = "🔥".repeat(35); // 35 chars (code points), 140 UTF-16 units
    const session = makeSession({ topic: `- ${emojiStr}`, lastMessage: "" });
    const output = formatSessionList([session], true);
    // Should not crash and should contain emoji
    expect(output).toContain("🔥");
  });

  test("long string beyond 100 chars gets truncated with ellipsis", () => {
    const longLabel = "a".repeat(120);
    const session = makeSession({ topic: `- ${longLabel}`, lastMessage: "" });
    const output = formatSessionList([session], true);
    expect(output).toContain("...");
  });

  test("CJK characters counted by code points", () => {
    // CJK chars are BMP (single UTF-16 code unit) but Array.from still counts them correctly
    // "- " (2 chars) + 101 CJK chars = 103 code points > 100 limit → truncated
    const cjkStr = "中".repeat(101);
    const session = makeSession({ topic: `- ${cjkStr}`, lastMessage: "" });
    const output = formatSessionList([session], true);
    expect(output).toContain("...");
  });

  test("string exactly at max length (100) is not truncated", () => {
    const exactStr = "a".repeat(98); // 98 chars + "- " prefix = 100 char label
    const session = makeSession({ topic: `- ${exactStr}`, lastMessage: "" });
    const output = formatSessionList([session], true);
    // Should NOT add ellipsis since it's exactly at the limit
    // The label is "- " + 98 chars = 100 chars, which should not be truncated
    const lines = output.split("\n").filter((l) => l.startsWith("  "));
    const labelLine = lines[0];
    expect(labelLine).not.toContain("...");
  });
});
