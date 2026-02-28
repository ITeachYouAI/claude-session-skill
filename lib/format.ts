import type { SessionEntry } from "./indexer";
import { isGarbageSummary } from "./indexer";

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  // Use Array.from to split by code points, not UTF-16 code units.
  // This prevents splitting surrogate pairs (emoji, CJK, etc.)
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  return chars.slice(0, max - 3).join("") + "...";
}

function formatDate(ts: number): string {
  if (!ts) return "unknown";
  const d = new Date(ts);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const hours = d.getHours();
  const mins = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  return `${month} ${day}, ${h}:${mins} ${ampm}`;
}

// Get single-line display for list view — first bullet or last message
function displayLine(s: SessionEntry): string {
  if (s.topic && !isGarbageSummary(s.topic)) {
    // If topic has bullets, return just the first one
    const lines = s.topic.split("\n").filter((l: string) => l.trim().length > 0);
    const firstBullet = lines.find((l: string) => l.startsWith("- "));
    if (firstBullet) return firstBullet;
    // Single-line summary (old format) — use as-is
    return lines[0] || s.topic;
  }
  if (s.lastMessage) return s.lastMessage;
  return s.firstMessage || "(no messages)";
}

// Combine name + summary for list/search views
function makeLabel(s: SessionEntry, summary: string): string {
  if (!s.name) return summary;
  const clean = summary.startsWith("- ") ? summary.slice(2) : summary;
  return `${s.name} — ${clean}`;
}

// Get full bullet summary for detail view
function fullSummary(s: SessionEntry): string {
  if (s.topic && !isGarbageSummary(s.topic)) return s.topic;
  if (s.lastMessage) return s.lastMessage;
  return s.firstMessage || "(no messages)";
}

export function formatSessionList(sessions: SessionEntry[], showAll: boolean): string {
  const list = showAll ? sessions : sessions.slice(0, 20);
  const lines: string[] = [];

  if (!showAll && sessions.length > 20) {
    lines.push(`${sessions.length} sessions (showing 20, use --all for all)\n`);
  } else {
    lines.push(`${list.length} session(s)\n`);
  }

  for (const s of list) {
    const date = formatDate(s.lastTimestamp);
    const msgs = `${s.messageCount} msgs`;
    const summary = displayLine(s);
    const label = makeLabel(s, summary);
    const lastMsg = s.lastMessage && s.lastMessage !== summary
      ? s.lastMessage
      : "";

    lines.push(`${s.id}    ${msgs.padStart(7)} | ${date}`);
    lines.push(`  ${truncate(label, 100)}`);
    if (lastMsg) {
      lines.push(`  Left off: "${truncate(lastMsg, 90)}"`);
    }
    if (s.cwd) {
      lines.push(`  Resume:   cd ${s.cwd} && claude --resume ${s.id}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatSearchResults(sessions: SessionEntry[], query: string): string {
  if (sessions.length === 0) {
    return `No sessions found matching "${query}"`;
  }

  const lines: string[] = [];
  const shown = sessions.slice(0, 15);
  lines.push(`${sessions.length} session(s) matching "${query}"${sessions.length > 15 ? " (showing 15)" : ""}:\n`);

  for (const s of shown) {
    const date = formatDate(s.lastTimestamp);
    const msgs = `${s.messageCount} msgs`;
    const summary = displayLine(s);
    const label = makeLabel(s, summary);
    const lastMsg = s.lastMessage && s.lastMessage !== summary
      ? s.lastMessage
      : "";

    lines.push(`${s.id}    ${msgs.padStart(7)} | ${date}`);
    lines.push(`  ${truncate(label, 100)}`);
    if (lastMsg) {
      lines.push(`  Left off: "${truncate(lastMsg, 90)}"`);
    }
    if (s.gitBranch) {
      lines.push(`  Branch:   ${s.gitBranch}`);
    }
    if (s.cwd) {
      lines.push(`  Resume:   cd ${s.cwd} && claude --resume ${s.id}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatSessionDetail(session: SessionEntry): string {
  const s = session;
  const lines: string[] = [];
  lines.push(`${s.id}\n`);
  if (s.name) {
    lines.push(`Name:     ${s.name}`);
  }
  lines.push(`Project:  ${s.project}`);
  lines.push(`CWD:      ${s.cwd}`);
  if (s.gitBranch) {
    lines.push(`Branch:   ${s.gitBranch}`);
  }
  lines.push(`Messages: ${s.messageCount}`);
  lines.push(`Started:  ${formatDate(s.firstTimestamp)}`);
  lines.push(`Last:     ${formatDate(s.lastTimestamp)}`);
  lines.push("");
  lines.push(`What was done:`);
  lines.push(fullSummary(s));
  lines.push("");
  if (s.lastMessage) {
    lines.push(`Left off: "${s.lastMessage.slice(0, 300)}"`);
    lines.push("");
  }
  if (s.cwd) {
    lines.push(`Resume with:`);
    lines.push(`  cd ${s.cwd} && claude --resume ${s.id}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function formatStats(sessions: SessionEntry[]): string {
  const byProject = new Map<string, { count: number; messages: number; lastActivity: number }>();

  for (const s of sessions) {
    const key = s.project || "~";
    const existing = byProject.get(key);
    if (existing) {
      existing.count++;
      existing.messages += s.messageCount;
      if (s.lastTimestamp > existing.lastActivity) {
        existing.lastActivity = s.lastTimestamp;
      }
    } else {
      byProject.set(key, {
        count: 1,
        messages: s.messageCount,
        lastActivity: s.lastTimestamp,
      });
    }
  }

  const sorted = Array.from(byProject.entries()).sort((a, b) => b[1].count - a[1].count);

  const lines: string[] = [];
  lines.push(`${sessions.length} sessions across ${sorted.length} projects\n`);
  lines.push(`  ${"Project".padEnd(30)}  ${"Sessions".padStart(8)}  ${"Messages".padStart(8)}  Last Activity`);
  lines.push(`  ${"-".repeat(30)}  ${"-".repeat(8)}  ${"-".repeat(8)}  ${"-".repeat(18)}`);

  for (const [project, data] of sorted) {
    const p = truncate(project, 30).padEnd(30);
    lines.push(`  ${p}  ${data.count.toString().padStart(8)}  ${data.messages.toString().padStart(8)}  ${formatDate(data.lastActivity)}`);
  }

  return lines.join("\n");
}
