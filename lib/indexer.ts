import { readdir, stat, mkdir, rename, unlink, readFile, writeFile, open } from "fs/promises";
import { join, basename } from "path";

const HOME = process.env.HOME;
if (!HOME) {
  throw new Error("HOME environment variable is not set");
}

const SUMMARY_MODEL = process.env.SESSION_SUMMARY_MODEL || "claude-haiku-4-5-20251001";
const DEBUG = Boolean(process.env.SESSION_DEBUG);

function debug(msg: string): void {
  if (DEBUG) process.stderr.write(`[session] ${msg}\n`);
}

const CLAUDE_DIR = join(HOME, ".claude");
const HISTORY_FILE = join(CLAUDE_DIR, "history.jsonl");
const PROJECTS_DIR = join(CLAUDE_DIR, "projects");
const DATA_DIR = join(CLAUDE_DIR, "skills", "session", "data");
const CACHE_FILE = join(DATA_DIR, "index.json");
const SUMMARIES_FILE = join(DATA_DIR, "summaries.json");
const NAMES_FILE = join(DATA_DIR, "names.json");

export interface SessionEntry {
  id: string;
  name: string;            // user-assigned name, empty if unset
  project: string;
  projectDir: string;
  topic: string;           // LLM-generated bullet summary
  firstMessage: string;
  lastMessage: string;
  allMessages: string;
  messageCount: number;
  firstTimestamp: number;
  lastTimestamp: number;
  cwd: string;
  gitBranch: string;
}

interface CacheMeta {
  historyMtime: number;
  sessionFileCount: number;
  maxSessionMtime: number;
  builtAt: number;
}

interface CacheFile {
  meta: CacheMeta;
  sessions: SessionEntry[];
}

type SummariesCache = Record<string, string>;

let dataDirReady = false;
async function ensureDataDir(): Promise<void> {
  if (dataDirReady) return;
  await mkdir(DATA_DIR, { recursive: true });
  dataDirReady = true;
}

export function shortProject(project: string): string {
  if (!project || project === HOME) return "~";
  const p = project.startsWith(HOME!) ? project.slice(HOME!.length + 1) : project;
  return p || "~";
}

export function decodeProjectDir(dirName: string): string {
  return "/" + dirName.replace(/^-/, "").replace(/-/g, "/");
}

export function isTopical(msg: string): boolean {
  if (msg.length < 5) return false;
  if (msg.startsWith("/")) return false;
  if (msg.startsWith("<")) return false;
  if (msg.startsWith("[MEMORY]")) return false;
  return true;
}

export function isGarbageSummary(s: string): boolean {
  if (!s) return true;
  const lower = s.toLowerCase();
  return (
    lower.startsWith("i don't have") ||
    lower.startsWith("i don't see") ||
    lower.startsWith("i'm afraid") ||
    lower.startsWith("i cannot") ||
    lower.startsWith("(80 chars max)") ||
    lower.includes("don't have a transcript") ||
    lower.includes("don't have access")
  );
}

// Resolve a partial or full session ID to a unique SessionEntry.
// Returns { ok: true, match } on success, { ok: false, error } on ambiguous/not-found.
export function resolveSession(
  sessions: SessionEntry[],
  id: string
): { ok: true; match: SessionEntry } | { ok: false; error: string } {
  const matches = sessions.filter(
    (s) => s.id === id || s.id.startsWith(id)
  );
  if (matches.length === 0) {
    return { ok: false, error: `No session found matching "${id}"` };
  }
  // Exact match always wins even when multiple prefix matches exist
  const exact = matches.find((s) => s.id === id);
  if (exact) return { ok: true, match: exact };
  if (matches.length > 1) {
    return { ok: false, error: `Ambiguous prefix "${id}" matches ${matches.length} sessions. Provide more characters.` };
  }
  return { ok: true, match: matches[0] };
}

async function getHistoryMtime(): Promise<number> {
  try {
    return (await stat(HISTORY_FILE)).mtimeMs;
  } catch (e) {
    debug(`Cannot stat history file: ${(e as Error).message}`);
    return 0;
  }
}

interface SessionFilesFingerprint {
  count: number;
  maxMtime: number;
}

async function getSessionFilesFingerprint(): Promise<SessionFilesFingerprint> {
  let count = 0;
  let maxMtime = 0;
  try {
    const dirs = await readdir(PROJECTS_DIR);
    for (const dir of dirs) {
      try {
        const dirPath = join(PROJECTS_DIR, dir);
        const files = await readdir(dirPath);
        for (const f of files) {
          if (!f.endsWith(".jsonl")) continue;
          count++;
          try {
            const info = await stat(join(dirPath, f));
            if (info.mtimeMs > maxMtime) maxMtime = info.mtimeMs;
          } catch (e) {
            debug(`Cannot stat ${dir}/${f}: ${(e as Error).message}`);
          }
        }
      } catch (e) {
        debug(`Cannot read project dir ${dir}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    debug(`Cannot read projects dir: ${(e as Error).message}`);
  }
  return { count, maxMtime };
}

async function loadCache(): Promise<CacheFile | null> {
  try {
    const raw = JSON.parse(await readFile(CACHE_FILE, "utf-8"));
    if (!raw?.meta || !Array.isArray(raw?.sessions)) return null;
    return raw as CacheFile;
  } catch {
    return null;
  }
}

async function atomicWrite(path: string, data: string): Promise<void> {
  const tmp = path + ".tmp";
  await writeFile(tmp, data);
  await rename(tmp, path);
}

async function saveCache(data: CacheFile): Promise<void> {
  await ensureDataDir();
  await atomicWrite(CACHE_FILE, JSON.stringify(data));
}

async function loadSummaries(): Promise<SummariesCache> {
  try {
    return JSON.parse(await readFile(SUMMARIES_FILE, "utf-8"));
  } catch {
    return {};
  }
}

async function saveSummaries(summaries: SummariesCache): Promise<void> {
  await ensureDataDir();
  await atomicWrite(SUMMARIES_FILE, JSON.stringify(summaries));
}

type NamesCache = Record<string, string>;

// In-memory cache for names with mtime check
let _namesCache: NamesCache | null = null;
let _namesMtime: number = 0;

async function loadNames(): Promise<NamesCache> {
  try {
    const currentMtime = (await stat(NAMES_FILE)).mtimeMs;
    if (_namesCache && currentMtime === _namesMtime) return { ..._namesCache };
    const raw = JSON.parse(await readFile(NAMES_FILE, "utf-8"));
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
    const cleaned: NamesCache = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string") cleaned[k] = v;
    }
    _namesCache = cleaned;
    _namesMtime = currentMtime;
    return { ...cleaned };
  } catch {
    return {};
  }
}

async function saveNames(names: NamesCache): Promise<void> {
  await ensureDataDir();
  await atomicWrite(NAMES_FILE, JSON.stringify(names));
  // Invalidate mtime cache so next load picks up the write
  _namesCache = null;
  _namesMtime = 0;
}

const LOCK_FILE = NAMES_FILE + ".lock";
const LOCK_TIMEOUT = 5000; // 5 seconds

async function acquireLock(): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < LOCK_TIMEOUT) {
    try {
      // O_EXCL semantics — fails if file exists
      const fh = await open(LOCK_FILE, "wx");
      await fh.write(String(process.pid));
      await fh.close();
      return true;
    } catch {
      // Check if lock is stale (older than 10s)
      try {
        const lockStat = await stat(LOCK_FILE);
        if (Date.now() - lockStat.mtimeMs > 10000) {
          await unlink(LOCK_FILE).catch(() => {});
          continue;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  return false;
}

async function releaseLock(): Promise<void> {
  await unlink(LOCK_FILE).catch(() => {});
}

export async function nameSession(sessionId: string, name: string): Promise<{ ok: boolean; fullId?: string; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name cannot be empty." };
  if (trimmed.length > 50) return { ok: false, error: `Name too long (${trimmed.length} chars, max 50).` };

  const cache = await loadCache();
  if (!cache) return { ok: false, error: "No index found. Run `/session list` first." };

  const resolved = resolveSession(cache.sessions, sessionId);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const match = resolved.match;

  // Advisory lock to prevent concurrent write corruption
  const locked = await acquireLock();
  if (!locked) return { ok: false, error: "Could not acquire lock. Another naming operation may be in progress." };

  try {
    // Load fresh names inside lock to prevent race
    const names = await loadNames();
    names[match.id] = trimmed;
    await saveNames(names);
    return { ok: true, fullId: match.id };
  } finally {
    await releaseLock();
  }
}

export async function clearSessionName(sessionId: string): Promise<{ ok: boolean; fullId?: string; error?: string }> {
  const cache = await loadCache();
  if (!cache) return { ok: false, error: "No index found. Run `/session list` first." };

  const resolved = resolveSession(cache.sessions, sessionId);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const match = resolved.match;

  const locked = await acquireLock();
  if (!locked) return { ok: false, error: "Could not acquire lock." };

  try {
    const names = await loadNames();
    if (!names[match.id]) return { ok: false, error: `Session ${match.id.slice(0, 8)}... has no name to clear.` };
    delete names[match.id];
    await saveNames(names);
    return { ok: true, fullId: match.id };
  } finally {
    await releaseLock();
  }
}

// Extract conversation messages from session file — prioritize LAST messages
export function extractConversation(text: string, maxMessages = 40): string[] {
  const lines = text.split("\n").filter(Boolean);
  const allMessages: string[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // User messages
      if (
        entry.type === "user" &&
        !entry.isMeta &&
        entry.message?.role === "user" &&
        typeof entry.message.content === "string"
      ) {
        const content = entry.message.content;
        if (isTopical(content)) {
          allMessages.push(`USER: ${content.slice(0, 300)}`);
        }
      }

      // Assistant messages
      if (
        entry.type === "assistant" &&
        entry.message?.role === "assistant"
      ) {
        const content = entry.message.content;
        if (typeof content === "string" && content.length > 20) {
          allMessages.push(`ASSISTANT: ${content.slice(0, 400)}`);
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text" && block.text && block.text.length > 20) {
              allMessages.push(`ASSISTANT: ${block.text.slice(0, 400)}`);
              break;
            }
          }
        }
      }
    } catch (e) {
      debug(`Malformed JSONL line: ${(e as Error).message}`);
    }
  }

  // Take LAST N messages — that's where the real work is
  if (allMessages.length <= maxMessages) return allMessages;
  return allMessages.slice(-maxMessages);
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: { type: string; message: string };
}

// Call Haiku to summarize a session — returns 5 bullet points
async function summarizeSession(
  project: string,
  conversation: string[]
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    debug("ANTHROPIC_API_KEY not set, skipping summarization");
    return "";
  }

  const transcript = conversation.join("\n").slice(0, 6000);
  if (transcript.length < 50) return "";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        max_tokens: 250,
        messages: [
          {
            role: "user",
            content: `You are summarizing a Claude Code session transcript. Write exactly 5 bullet points (using "- " prefix) describing what was DONE in this session. Focus on concrete outcomes: what was built, fixed, configured, discussed, or decided. Each bullet should be 8-15 words. No intro text, no commentary — ONLY the 5 bullets.

If the transcript is mostly commands like /session or slash commands with no real work, write "- Session management only (no substantive work)" as the single bullet.

Project: ${project}

Transcript:
${transcript}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      if (res.status === 429) {
        process.stderr.write("[session] Rate limited by Anthropic API, slowing down\n");
      } else if (res.status === 401) {
        process.stderr.write("[session] Invalid ANTHROPIC_API_KEY\n");
      } else {
        debug(`API returned ${res.status}: ${res.statusText}`);
      }
      return "";
    }

    const data: AnthropicResponse = await res.json();
    let text = data.content?.[0]?.text?.trim() || "";
    // Strip markdown formatting
    text = text.replace(/^\*\*(.+)\*\*$/gm, "$1");
    text = text.replace(/^#+\s*/gm, "");
    text = text.replace(/```[\s\S]*?```/g, "");
    text = text.replace(/\*\*/g, "");
    // Ensure bullets use "- " format
    text = text.replace(/^[•●◦]\s*/gm, "- ");
    text = text.replace(/^\d+\.\s+/gm, "- ");
    // Only keep lines that start with "- "
    const bullets = text.split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l.startsWith("- "))
      .slice(0, 5);
    return bullets.join("\n") || "";
  } catch (e) {
    debug(`API call failed: ${(e as Error).message}`);
    return "";
  }
}

// Phase 1: Parse history.jsonl
async function parseHistory(): Promise<Map<string, SessionEntry>> {
  const sessions = new Map<string, SessionEntry>();

  try {
    const raw = await readFile(HISTORY_FILE, "utf-8");
    const lines = raw.split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (!entry.sessionId || !entry.display) continue;

        const id = entry.sessionId;
        const msg = entry.display.trim();
        if (!msg) continue;

        const topical = isTopical(msg);
        const existing = sessions.get(id);

        if (existing) {
          existing.messageCount++;
          if (topical) existing.lastMessage = msg;
          if (topical && existing.firstMessage === existing.id) {
            existing.firstMessage = msg;
          }
          existing.lastTimestamp = entry.timestamp;
          if (existing.allMessages.length < 2000) {
            existing.allMessages += " " + msg;
          }
        } else {
          sessions.set(id, {
            id,
            name: "",
            project: shortProject(entry.project || ""),
            projectDir: "",
            topic: "",
            firstMessage: topical ? msg : id,
            lastMessage: topical ? msg : "",
            allMessages: msg,
            messageCount: 1,
            firstTimestamp: entry.timestamp,
            lastTimestamp: entry.timestamp,
            cwd: entry.project || "",
            gitBranch: "",
          });
        }
      } catch (e) {
        debug(`Malformed history line: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    debug(`Cannot read history file: ${(e as Error).message}`);
  }

  // Clean up placeholders
  for (const [, session] of sessions) {
    if (session.firstMessage === session.id) {
      session.firstMessage = session.allMessages.trim().slice(0, 100) || "(no messages)";
    }
    if (!session.lastMessage) {
      session.lastMessage = session.firstMessage;
    }
  }

  return sessions;
}

// Phase 2: Enrich from session files + read conversation for summaries
async function enrichFromFiles(
  sessions: Map<string, SessionEntry>,
  conversationMap: Map<string, string[]>
): Promise<void> {
  try {
    const dirs = await readdir(PROJECTS_DIR);

    for (const dir of dirs) {
      const dirPath = join(PROJECTS_DIR, dir);
      let files: string[];
      try {
        files = (await readdir(dirPath)).filter((f) => f.endsWith(".jsonl"));
      } catch (e) {
        debug(`Cannot read ${dir}: ${(e as Error).message}`);
        continue;
      }

      for (const file of files) {
        const sessionId = basename(file, ".jsonl");
        const filePath = join(dirPath, file);

        try {
          const fileInfo = await stat(filePath);
          const fileSize = fileInfo.size;

          let text: string;
          if (fileSize <= 60000) {
            text = await readFile(filePath, "utf-8");
          } else {
            // For large files, read all and take first 10KB + last 50KB (by chars)
            const allText = await readFile(filePath, "utf-8");
            const first = allText.slice(0, 10000);
            const last = allText.slice(-50000);
            text = first + "\n" + last;
          }

          // Extract conversation for summary generation
          const conversation = extractConversation(text, 40);
          if (conversation.length > 0) {
            conversationMap.set(sessionId, conversation);
          }

          const lines = text.split("\n").filter(Boolean);
          let cwd = "";
          let gitBranch = "";
          const userMessages: string[] = [];
          let firstTs = Infinity;
          let lastTs = 0;

          for (const line of lines) {
            try {
              const entry = JSON.parse(line);

              if (entry.type === "user" && entry.cwd) {
                if (!cwd) cwd = entry.cwd;
                if (entry.gitBranch && entry.gitBranch !== "HEAD") {
                  gitBranch = entry.gitBranch;
                }
              }

              if (entry.timestamp) {
                const ts = typeof entry.timestamp === "string"
                  ? new Date(entry.timestamp).getTime()
                  : entry.timestamp;
                if (ts < firstTs) firstTs = ts;
                if (ts > lastTs) lastTs = ts;
              }

              if (
                entry.type === "user" &&
                !entry.isMeta &&
                entry.message?.role === "user" &&
                typeof entry.message.content === "string"
              ) {
                if (isTopical(entry.message.content)) {
                  userMessages.push(entry.message.content.slice(0, 200));
                }
              }
            } catch (e) {
              debug(`Malformed session line in ${sessionId}: ${(e as Error).message}`);
            }
          }

          const existing = sessions.get(sessionId);
          if (existing) {
            if (cwd) existing.cwd = cwd;
            if (gitBranch) existing.gitBranch = gitBranch;
            existing.projectDir = dir;
            if (!existing.project || existing.project === "~") {
              existing.project = shortProject(cwd || decodeProjectDir(dir));
            }
          } else if (userMessages.length > 0) {
            sessions.set(sessionId, {
              id: sessionId,
              name: "",
              project: shortProject(cwd || decodeProjectDir(dir)),
              projectDir: dir,
              topic: "",
              firstMessage: userMessages[0] || "",
              lastMessage: userMessages[userMessages.length - 1] || "",
              allMessages: userMessages.join(" ").slice(0, 2000),
              messageCount: userMessages.length,
              firstTimestamp: firstTs === Infinity ? 0 : firstTs,
              lastTimestamp: lastTs,
              cwd: cwd,
              gitBranch: gitBranch,
            });
          }
        } catch (e) {
          debug(`Cannot process session ${sessionId}: ${(e as Error).message}`);
        }
      }
    }
  } catch (e) {
    debug(`Cannot read projects dir: ${(e as Error).message}`);
  }
}

// Phase 3: Generate summaries — skip sessions with existing GOOD summaries
async function generateSummaries(
  sessions: SessionEntry[],
  conversationMap: Map<string, string[]>,
  existingSummaries: SummariesCache
): Promise<SummariesCache> {
  const summaries = { ...existingSummaries };

  // Purge garbage summaries so they get regenerated
  for (const [id, summary] of Object.entries(summaries)) {
    if (isGarbageSummary(summary)) {
      delete summaries[id];
    }
  }

  const needsSummary = sessions.filter(
    (s) => !summaries[s.id] && conversationMap.has(s.id)
  );

  if (needsSummary.length === 0) return summaries;

  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write(
      `[session] ${needsSummary.length} sessions need summaries but ANTHROPIC_API_KEY is not set\n`
    );
    return summaries;
  }

  const total = needsSummary.length;
  process.stderr.write(`Summarizing ${total} sessions with ${SUMMARY_MODEL}...\n`);

  const BATCH_SIZE = 10;
  let done = 0;

  for (let i = 0; i < needsSummary.length; i += BATCH_SIZE) {
    const batch = needsSummary.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (session) => {
        const conversation = conversationMap.get(session.id) || [];
        const summary = await summarizeSession(session.project, conversation);
        return { id: session.id, summary };
      })
    );

    for (const { id, summary } of results) {
      if (summary && !isGarbageSummary(summary)) {
        summaries[id] = summary;
      }
    }

    done += batch.length;
    process.stderr.write(`  ${done}/${total}\n`);
  }

  return summaries;
}

export async function buildIndex(force = false): Promise<SessionEntry[]> {
  const [historyMtime, fingerprint] = await Promise.all([
    getHistoryMtime(),
    getSessionFilesFingerprint(),
  ]);

  if (!force) {
    const cache = await loadCache();
    if (
      cache &&
      cache.meta.historyMtime === historyMtime &&
      cache.meta.sessionFileCount === fingerprint.count &&
      cache.meta.maxSessionMtime === fingerprint.maxMtime
    ) {
      // Apply names to cached sessions
      const names = await loadNames();
      for (const s of cache.sessions) {
        s.name = names[s.id] || "";
      }
      return cache.sessions;
    }
  }

  const existingSummaries = await loadSummaries();

  // Phase 1 + 2
  const sessions = await parseHistory();
  const conversationMap = new Map<string, string[]>();
  await enrichFromFiles(sessions, conversationMap);

  const entries = Array.from(sessions.values()).filter(
    (s) => s.messageCount > 0 && s.firstMessage.length > 0
  );

  entries.sort((a, b) => b.lastTimestamp - a.lastTimestamp);

  // Phase 3
  const summaries = await generateSummaries(entries, conversationMap, existingSummaries);
  await saveSummaries(summaries);

  const names = await loadNames();
  for (const entry of entries) {
    entry.topic = summaries[entry.id] || "";
    entry.name = names[entry.id] || "";
  }

  await saveCache({
    meta: {
      historyMtime,
      sessionFileCount: fingerprint.count,
      maxSessionMtime: fingerprint.maxMtime,
      builtAt: Date.now(),
    },
    sessions: entries,
  });

  return entries;
}
