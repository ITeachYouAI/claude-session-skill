import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FIXTURES = join(import.meta.dir, "fixtures");

const HISTORY_CONTENT = readFileSync(join(FIXTURES, "history.jsonl"), "utf-8");
const HISTORY_MALFORMED = readFileSync(join(FIXTURES, "history-malformed.jsonl"), "utf-8");
const SESSION_FILE_CONTENT = readFileSync(join(FIXTURES, "session-file.jsonl"), "utf-8");
const SUMMARIES_CONTENT = readFileSync(join(FIXTURES, "summaries.json"), "utf-8");
const NAMES_CONTENT = readFileSync(join(FIXTURES, "names.json"), "utf-8");

// Monotonically increasing counter for unique mtimes — avoids Date.now() collision
// when consecutive tests run within the same millisecond.
let _mtimeCounter = 1000;
function nextMtime() { return ++_mtimeCounter; }

// ── Shared mock state (mutable so individual tests can override) ──────────────

const readFileMock = mock(async (_path: string): Promise<string> => {
  throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
});

const writeFileMock = mock(async (): Promise<void> => {});
const renameMock = mock(async (): Promise<void> => {});
const unlinkMock = mock(async (): Promise<void> => {});
const mkdirMock = mock(async (): Promise<void> => {});

const statMock = mock(async (_path: string): Promise<{ mtimeMs: number; size: number }> => {
  throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
});

const readdirMock = mock(async (_path: string): Promise<string[]> => []);

const openMock = mock(async () => ({
  write: mock(async () => ({ bytesWritten: 0 })),
  close: mock(async () => {}),
}));

// ── Register the module mock BEFORE any import of indexer ────────────────────

mock.module("fs/promises", () => ({
  readFile: readFileMock,
  writeFile: writeFileMock,
  rename: renameMock,
  unlink: unlinkMock,
  mkdir: mkdirMock,
  stat: statMock,
  readdir: readdirMock,
  open: openMock,
}));

// ── Now import the module (picks up the mock) ─────────────────────────────────

const {
  buildIndex,
  nameSession,
  clearSessionName,
  resolveSession,
} = await import("../indexer");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeValidCache(sessions: object[] = []) {
  return JSON.stringify({
    meta: { historyMtime: 1000, sessionFileCount: 0, maxSessionMtime: 0, builtAt: Date.now() },
    sessions,
  });
}

function makeCacheSession(overrides: object = {}) {
  return {
    id: "abc123def456abc1",
    name: "",
    project: "app",
    projectDir: "",
    topic: "",
    firstMessage: "Fix the login bug",
    lastMessage: "Done with fix",
    allMessages: "Fix the login bug Done with fix",
    messageCount: 2,
    firstTimestamp: 1709000000000,
    lastTimestamp: 1709001000000,
    cwd: "/Users/tim/projects/app",
    gitBranch: "main",
    ...overrides,
  };
}

/** Reset all mocks to ENOENT/empty defaults */
function resetMocks() {
  readFileMock.mockImplementation(async (_path: string): Promise<string> => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  });
  writeFileMock.mockImplementation(async (): Promise<void> => {});
  renameMock.mockImplementation(async (): Promise<void> => {});
  unlinkMock.mockImplementation(async (): Promise<void> => {});
  mkdirMock.mockImplementation(async (): Promise<void> => {});
  statMock.mockImplementation(async (_path: string): Promise<{ mtimeMs: number; size: number }> => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  });
  readdirMock.mockImplementation(async (): Promise<string[]> => []);
  openMock.mockImplementation(async () => ({
    write: mock(async () => ({ bytesWritten: 0 })),
    close: mock(async () => {}),
  }));
}

// ── resolveSession (pure function, no I/O) ────────────────────────────────────

describe("resolveSession", () => {
  const s1 = makeCacheSession({ id: "abc123def456abc1" }) as Parameters<typeof resolveSession>[0][0];
  const s2 = makeCacheSession({ id: "xyz789abc012xyz7" }) as Parameters<typeof resolveSession>[0][0];

  test("exact ID match", () => {
    const r = resolveSession([s1, s2], "abc123def456abc1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.match.id).toBe("abc123def456abc1");
  });

  test("prefix match (unique)", () => {
    const r = resolveSession([s1, s2], "abc123");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.match.id).toBe("abc123def456abc1");
  });

  test("prefix match (xyz prefix)", () => {
    const r = resolveSession([s1, s2], "xyz789");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.match.id).toBe("xyz789abc012xyz7");
  });

  test("ambiguous prefix returns error with count", () => {
    const s3 = makeCacheSession({ id: "abc999xyz000abc9" }) as typeof s1;
    const r = resolveSession([s1, s3], "abc");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Ambiguous");
      expect(r.error).toContain("2");
    }
  });

  test("exact full ID wins over ambiguous prefix matches", () => {
    // s1 starts with "abc123def456abc1" — exact match
    // s2 id starts with xyz so no conflict. But let's add a 3rd that shares prefix.
    const s3 = makeCacheSession({ id: "abc123def456abc1extra" }) as typeof s1;
    const r = resolveSession([s1, s3], "abc123def456abc1");
    // Exact match should win
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.match.id).toBe("abc123def456abc1");
  });

  test("no match returns error", () => {
    const r = resolveSession([s1, s2], "zzz999");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("No session found");
      expect(r.error).toContain("zzz999");
    }
  });

  test("empty sessions list returns error", () => {
    const r = resolveSession([], "abc123");
    expect(r.ok).toBe(false);
  });
});

// ── buildIndex ────────────────────────────────────────────────────────────────

describe("buildIndex", () => {
  beforeEach(resetMocks);

  test("returns [] when history.jsonl missing and no session files", async () => {
    // All mocks default to ENOENT — no history, no cache, no session dirs
    const result = await buildIndex(true);
    expect(result).toEqual([]);
  });

  test("parses valid history.jsonl", async () => {
    statMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("history.jsonl")) return { mtimeMs: 9999, size: 500 };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("history.jsonl")) return HISTORY_CONTENT;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const result = await buildIndex(true);
    expect(result.length).toBeGreaterThan(0);
    // The fixture has 2 messages for abc123... and 1 for xyz789...
    const ids = result.map((s) => s.id);
    expect(ids).toContain("abc123def456abc1");
    expect(ids).toContain("xyz789abc012xyz7");
  });

  test("skips malformed JSONL lines", async () => {
    statMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("history.jsonl")) return { mtimeMs: 9999, size: 500 };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("history.jsonl")) return HISTORY_MALFORMED;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const result = await buildIndex(true);
    // Should only have the 2 valid sessions, not crash
    expect(result.length).toBe(2);
    const ids = result.map((s) => s.id);
    expect(ids).toContain("valid001validid1");
    expect(ids).toContain("valid002validid2");
  });

  test("returns cached sessions when fingerprint unchanged", async () => {
    const cachedSession = makeCacheSession();
    const cacheContent = makeValidCache([cachedSession]);

    statMock.mockImplementation(async (path: string) => {
      // history.jsonl mtime matches cache meta
      if (String(path).endsWith("history.jsonl")) return { mtimeMs: 1000, size: 500 };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("index.json")) return cacheContent;
      if (String(path).endsWith("names.json")) return "{}";
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const result = await buildIndex(false); // not forced
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("abc123def456abc1");
  });

  test("bypasses cache when force=true", async () => {
    const cachedSession = makeCacheSession();
    const cacheContent = makeValidCache([cachedSession]);

    statMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("history.jsonl")) return { mtimeMs: 1000, size: 500 };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("index.json")) return cacheContent;
      // history.jsonl is empty — so rebuild yields 0 sessions
      if (String(path).endsWith("history.jsonl")) return "";
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const result = await buildIndex(true); // forced
    // Force rebuilds from scratch — empty history means 0 sessions
    expect(result.length).toBe(0);
  });

  test("applies names from names.json to cached sessions", async () => {
    const cachedSession = makeCacheSession();
    const cacheContent = makeValidCache([cachedSession]);

    statMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("history.jsonl")) return { mtimeMs: 1000, size: 500 };
      if (String(path).endsWith("names.json")) return { mtimeMs: 2000, size: 50 };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("index.json")) return cacheContent;
      if (String(path).endsWith("names.json")) return NAMES_CONTENT;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const result = await buildIndex(false);
    expect(result[0].name).toBe("Login Fix Session");
  });

  test("purges garbage summaries before regenerating", async () => {
    // Summaries file has a garbage entry — buildIndex should purge it
    statMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("history.jsonl")) return { mtimeMs: 9999, size: 500 };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("history.jsonl")) return HISTORY_CONTENT;
      if (String(path).endsWith("summaries.json")) return SUMMARIES_CONTENT;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const result = await buildIndex(true);
    // The good summary should be preserved on the matching session
    const session = result.find((s) => s.id === "abc123def456abc1");
    expect(session?.topic).toContain("Fixed authentication bug");
    // Garbage summary session should not appear in results (it was only in summaries, not history/sessions)
    const garbagedSession = result.find((s) => s.id === "garbage001garbag1");
    expect(garbagedSession).toBeUndefined();
  });
});

// ── nameSession ───────────────────────────────────────────────────────────────

describe("nameSession", () => {
  beforeEach(resetMocks);

  function setupCacheWithSession(session: object = makeCacheSession()) {
    const namesMtime = nextMtime();
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("index.json")) return makeValidCache([session]);
      if (String(path).endsWith("names.json")) return "{}";
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    statMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("names.json")) return { mtimeMs: namesMtime, size: 2 };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
  }

  test("rejects empty name", async () => {
    setupCacheWithSession();
    const r = await nameSession("abc123def456abc1", "  ");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("empty");
  });

  test("rejects name longer than 50 chars", async () => {
    setupCacheWithSession();
    const r = await nameSession("abc123def456abc1", "x".repeat(51));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("too long");
  });

  test("errors when no cache exists", async () => {
    // readFileMock already throws ENOENT for everything
    const r = await nameSession("abc123def456abc1", "My Session");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("No index found");
  });

  test("errors when session ID not found", async () => {
    setupCacheWithSession();
    const r = await nameSession("zzz999notfound00", "My Session");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("No session found");
  });

  test("errors on ambiguous partial ID", async () => {
    const s1 = makeCacheSession({ id: "abc123def456abc1" });
    const s2 = makeCacheSession({ id: "abc123xyz789abc9" });
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("index.json")) return makeValidCache([s1, s2]);
      if (String(path).endsWith("names.json")) return "{}";
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    statMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("names.json")) return { mtimeMs: 1, size: 2 };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const r = await nameSession("abc123", "My Session");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Ambiguous");
  });

  test("resolves partial ID to exact match and writes name", async () => {
    setupCacheWithSession();
    const r = await nameSession("abc123", "Auth Fix");
    expect(r.ok).toBe(true);
    expect(r.fullId).toBe("abc123def456abc1");
    // writeFile was called (for the tmp names file)
    expect(writeFileMock).toHaveBeenCalled();
  });

  test("acquires lock, writes, releases", async () => {
    setupCacheWithSession();
    const closespy = mock(async () => {});
    openMock.mockImplementation(async () => ({
      write: mock(async () => ({ bytesWritten: 0 })),
      close: closespy,
    }));

    const r = await nameSession("abc123def456abc1", "Test Name");
    expect(r.ok).toBe(true);
    // Lock was acquired (open called) and released (unlink called)
    expect(openMock).toHaveBeenCalled();
    expect(unlinkMock).toHaveBeenCalled();
    expect(closespy).toHaveBeenCalled();
  });

  test("returns error when lock cannot be acquired", async () => {
    setupCacheWithSession();
    // Lock file exists and is fresh — open throws EEXIST each time
    openMock.mockImplementation(async () => {
      throw Object.assign(new Error("EEXIST"), { code: "EEXIST" });
    });
    statMock.mockImplementation(async (path: string) => {
      // Return fresh mtime for lock file (not stale)
      if (String(path).endsWith(".lock")) return { mtimeMs: Date.now(), size: 1 };
      if (String(path).endsWith("names.json")) return { mtimeMs: 1, size: 2 };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const r = await nameSession("abc123def456abc1", "Blocked");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("lock");
  }, 10000); // LOCK_TIMEOUT is 5s

  test("treats stale lock (>10s) as expired and succeeds", async () => {
    setupCacheWithSession();
    let lockExists = false;
    openMock.mockImplementation(async () => {
      if (lockExists) throw Object.assign(new Error("EEXIST"), { code: "EEXIST" });
      lockExists = true;
      return {
        write: mock(async () => ({ bytesWritten: 0 })),
        close: mock(async () => {}),
      };
    });
    statMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith(".lock")) return { mtimeMs: Date.now() - 15000, size: 1 }; // 15s old = stale
      if (String(path).endsWith("names.json")) return { mtimeMs: 1, size: 2 };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    // unlink removes the stale lock, then re-try of open sets lockExists=false indirectly
    // (openMock tracks lockExists state — first call succeeds, second call sees lockExists=true)
    // Actually let's simplify: just ensure stale lock path doesn't block
    // Reset openMock to succeed unconditionally (stale lock was deleted by unlink)
    unlinkMock.mockImplementation(async () => {
      // After stale lock is unlinked, reset open to succeed
      openMock.mockImplementation(async () => ({
        write: mock(async () => ({ bytesWritten: 0 })),
        close: mock(async () => {}),
      }));
    });

    const r = await nameSession("abc123def456abc1", "Stale Lock Test");
    expect(r.ok).toBe(true);
  });
});

// ── clearSessionName ──────────────────────────────────────────────────────────

describe("clearSessionName", () => {
  beforeEach(resetMocks);

  function setupCacheWithNamedSession() {
    // Use Date.now() as mtime to guarantee cache bust across tests
    // (module-level _namesCache uses mtime equality check)
    const namesMtime = nextMtime();
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("index.json"))
        return makeValidCache([makeCacheSession({ name: "Login Fix Session" })]);
      if (String(path).endsWith("names.json")) return NAMES_CONTENT;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    statMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("names.json")) return { mtimeMs: namesMtime, size: 50 };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
  }

  test("errors when no cache exists", async () => {
    const r = await clearSessionName("abc123def456abc1");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("No index found");
  });

  test("errors when session ID not found", async () => {
    setupCacheWithNamedSession();
    const r = await clearSessionName("zzz999notfound00");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("No session found");
  });

  test("errors when session has no name to clear", async () => {
    const namesMtime = nextMtime(); // distinct from any prior test
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("index.json")) return makeValidCache([makeCacheSession()]);
      if (String(path).endsWith("names.json")) return "{}"; // no names
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    statMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("names.json")) return { mtimeMs: namesMtime, size: 2 };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const r = await clearSessionName("abc123def456abc1");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("no name to clear");
  });

  test("clears name successfully", async () => {
    setupCacheWithNamedSession();
    const r = await clearSessionName("abc123def456abc1");
    expect(r.ok).toBe(true);
    expect(r.fullId).toBe("abc123def456abc1");
    expect(writeFileMock).toHaveBeenCalled();
  });

  test("resolves partial ID", async () => {
    setupCacheWithNamedSession();
    const r = await clearSessionName("abc123");
    expect(r.ok).toBe(true);
  });
});

// ── summarizeSession (via fetch mock) ─────────────────────────────────────────

describe("summarizeSession (via buildIndex with fetch mock)", () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    resetMocks();
    process.env.ANTHROPIC_API_KEY = "test-key-12345";
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = savedKey;
    (globalThis as any).fetch = fetch; // restore original fetch
  });

  function setupHistoryWithConversation() {
    statMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("history.jsonl")) return { mtimeMs: 9999, size: 500 };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("history.jsonl")) return HISTORY_CONTENT;
      if (String(path).endsWith("summaries.json")) return "{}";
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    readdirMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("projects")) return ["proj-dir"];
      if (String(path).endsWith("proj-dir")) return ["abc123def456abc1.jsonl"];
      return [];
    });
    // session file stat + content
    statMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("history.jsonl")) return { mtimeMs: 9999, size: 500 };
      if (String(path).endsWith(".jsonl")) return { mtimeMs: 999, size: SESSION_FILE_CONTENT.length };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith("history.jsonl")) return HISTORY_CONTENT;
      if (String(path).endsWith("abc123def456abc1.jsonl")) return SESSION_FILE_CONTENT;
      if (String(path).endsWith("summaries.json")) return "{}";
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
  }

  test("skips summarization when ANTHROPIC_API_KEY unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchSpy = mock(() => Promise.resolve(new Response("{}", { status: 200 })));
    (globalThis as any).fetch = fetchSpy;
    setupHistoryWithConversation();

    await buildIndex(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("returns empty summary on 429 rate limit", async () => {
    const fetchSpy = mock(() =>
      Promise.resolve(new Response("Rate limited", { status: 429 }))
    );
    (globalThis as any).fetch = fetchSpy;
    setupHistoryWithConversation();

    const result = await buildIndex(true);
    // Topic should be empty (no summary on 429)
    const session = result.find((s) => s.id === "abc123def456abc1");
    expect(session?.topic).toBe("");
  });

  test("returns empty summary on 401 auth error", async () => {
    const fetchSpy = mock(() =>
      Promise.resolve(new Response("Unauthorized", { status: 401 }))
    );
    (globalThis as any).fetch = fetchSpy;
    setupHistoryWithConversation();

    const result = await buildIndex(true);
    const session = result.find((s) => s.id === "abc123def456abc1");
    expect(session?.topic).toBe("");
  });

  test("returns empty summary on network failure", async () => {
    const fetchSpy = mock(() => Promise.reject(new Error("network error")));
    (globalThis as any).fetch = fetchSpy;
    setupHistoryWithConversation();

    const result = await buildIndex(true);
    const session = result.find((s) => s.id === "abc123def456abc1");
    expect(session?.topic).toBe("");
  });

  test("parses bullet format with • prefix", async () => {
    const fetchSpy = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: "• Fixed login bug in auth module\n• Added unit tests" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );
    (globalThis as any).fetch = fetchSpy;
    setupHistoryWithConversation();

    const result = await buildIndex(true);
    const session = result.find((s) => s.id === "abc123def456abc1");
    expect(session?.topic).toContain("- Fixed login bug");
  });

  test("parses bullet format with numbered list", async () => {
    const fetchSpy = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: "1. Fixed login bug\n2. Added tests" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );
    (globalThis as any).fetch = fetchSpy;
    setupHistoryWithConversation();

    const result = await buildIndex(true);
    const session = result.find((s) => s.id === "abc123def456abc1");
    expect(session?.topic).toContain("- Fixed login bug");
  });

  test("parses standard - bullet format", async () => {
    const fetchSpy = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: "- Fixed login bug\n- Added unit tests" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );
    (globalThis as any).fetch = fetchSpy;
    setupHistoryWithConversation();

    const result = await buildIndex(true);
    const session = result.find((s) => s.id === "abc123def456abc1");
    expect(session?.topic).toContain("- Fixed login bug");
  });
});
