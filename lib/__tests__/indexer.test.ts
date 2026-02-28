import { describe, test, expect } from "bun:test";
import { isTopical, shortProject, decodeProjectDir, extractConversation, isGarbageSummary } from "../indexer";

describe("isTopical", () => {
  test("rejects short messages", () => {
    expect(isTopical("hi")).toBe(false);
    expect(isTopical("")).toBe(false);
    expect(isTopical("abcd")).toBe(false);
  });

  test("rejects slash commands", () => {
    expect(isTopical("/session list")).toBe(false);
    expect(isTopical("/help")).toBe(false);
  });

  test("rejects XML-like messages", () => {
    expect(isTopical("<system-reminder>...")).toBe(false);
  });

  test("rejects MEMORY prefixed messages", () => {
    expect(isTopical("[MEMORY] saved")).toBe(false);
  });

  test("accepts normal user messages", () => {
    expect(isTopical("Fix the login bug")).toBe(true);
    expect(isTopical("What does this function do?")).toBe(true);
    expect(isTopical("Hello world")).toBe(true);
  });

  test("accepts messages exactly at length threshold", () => {
    expect(isTopical("abcde")).toBe(true);
  });
});

describe("shortProject", () => {
  const HOME = process.env.HOME!;

  test("returns ~ for empty or home directory", () => {
    expect(shortProject("")).toBe("~");
    expect(shortProject(HOME)).toBe("~");
  });

  test("strips home prefix", () => {
    expect(shortProject(`${HOME}/projects/my-app`)).toBe("projects/my-app");
  });

  test("returns full path for non-home paths", () => {
    expect(shortProject("/var/www/app")).toBe("/var/www/app");
  });
});

describe("decodeProjectDir", () => {
  test("decodes standard project directory names", () => {
    expect(decodeProjectDir("-Users-tim")).toBe("/Users/tim");
    expect(decodeProjectDir("-home-user-projects")).toBe("/home/user/projects");
  });

  test("handles leading dash removal", () => {
    const decoded = decodeProjectDir("-Users-tim-code");
    expect(decoded.startsWith("/")).toBe(true);
    expect(decoded).toBe("/Users/tim/code");
  });
});

describe("isGarbageSummary", () => {
  test("detects empty summaries", () => {
    expect(isGarbageSummary("")).toBe(true);
  });

  test("detects refusal responses", () => {
    expect(isGarbageSummary("I don't have access to the transcript")).toBe(true);
    expect(isGarbageSummary("I don't see any conversation")).toBe(true);
    expect(isGarbageSummary("I'm afraid I can't summarize")).toBe(true);
    expect(isGarbageSummary("I cannot provide a summary")).toBe(true);
  });

  test("detects format echoing", () => {
    expect(isGarbageSummary("(80 chars max) something")).toBe(true);
  });

  test("accepts valid summaries", () => {
    expect(isGarbageSummary("- Fixed authentication bug in login flow")).toBe(false);
    expect(isGarbageSummary("- Built session indexer with search")).toBe(false);
  });
});

describe("extractConversation", () => {
  function makeLine(type: string, role: string, content: string, isMeta = false): string {
    return JSON.stringify({
      type,
      isMeta,
      message: { role, content },
    });
  }

  test("extracts user messages", () => {
    const text = makeLine("user", "user", "Fix the login bug please");
    const result = extractConversation(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toStartWith("USER:");
    expect(result[0]).toContain("Fix the login bug");
  });

  test("extracts assistant messages", () => {
    const text = makeLine("assistant", "assistant", "I'll fix that bug by updating the auth handler to check for expired tokens.");
    const result = extractConversation(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toStartWith("ASSISTANT:");
  });

  test("skips meta messages", () => {
    const text = makeLine("user", "user", "some meta content", true);
    const result = extractConversation(text);
    expect(result).toHaveLength(0);
  });

  test("skips non-topical messages", () => {
    const text = makeLine("user", "user", "/help");
    const result = extractConversation(text);
    expect(result).toHaveLength(0);
  });

  test("respects maxMessages limit by taking last N", () => {
    const lines = Array.from({ length: 10 }, (_, i) =>
      makeLine("user", "user", `Message number ${i} is here`)
    ).join("\n");
    const result = extractConversation(lines, 3);
    expect(result).toHaveLength(3);
    // Should take the LAST 3 messages
    expect(result[2]).toContain("Message number 9");
  });

  test("handles malformed JSONL gracefully", () => {
    const text = [
      "{invalid json",
      makeLine("user", "user", "Valid message here"),
      "not json at all",
    ].join("\n");
    const result = extractConversation(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("Valid message");
  });

  test("handles empty input", () => {
    expect(extractConversation("")).toHaveLength(0);
    expect(extractConversation("\n\n\n")).toHaveLength(0);
  });

  test("truncates long user messages to 300 chars", () => {
    const longMsg = "x".repeat(500);
    const text = makeLine("user", "user", longMsg);
    const result = extractConversation(text);
    expect(result[0].length).toBeLessThanOrEqual(306);
  });

  test("handles assistant messages with content blocks", () => {
    const text = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Here is a detailed explanation of how the function works and why it needs fixing." },
        ],
      },
    });
    const result = extractConversation(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toStartWith("ASSISTANT:");
  });

  test("skips short assistant messages", () => {
    const text = makeLine("assistant", "assistant", "OK");
    const result = extractConversation(text);
    expect(result).toHaveLength(0);
  });
});
