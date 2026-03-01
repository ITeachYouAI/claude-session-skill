import type { SessionEntry } from "./indexer";

interface ScoredSession {
  session: SessionEntry;
  score: number;
}

export function searchSessions(
  sessions: SessionEntry[],
  query: string
): SessionEntry[] {
  const now = Date.now();
  const ONE_DAY = 86400000;
  const ONE_WEEK = 7 * ONE_DAY;

  // Extract quoted phrases
  const phrases: string[] = [];
  const stripped = query.replace(/"([^"]+)"/g, (_, phrase) => {
    phrases.push(phrase.toLowerCase());
    return "";
  });

  // Remaining tokens
  const tokens = stripped
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);

  if (tokens.length === 0 && phrases.length === 0) return sessions;

  const scored: ScoredSession[] = [];

  for (const session of sessions) {
    let score = 0;

    const nameLower = (session.name || "").toLowerCase();
    const topicLower = (session.topic || session.firstMessage || "").toLowerCase();
    const firstLower = session.firstMessage.toLowerCase();
    const lastLower = session.lastMessage.toLowerCase();
    const allLower = session.allMessages.toLowerCase();
    const projectLower = session.project.toLowerCase();
    const cwdLower = session.cwd.toLowerCase();

    // Token scoring
    for (const token of tokens) {
      if (nameLower.includes(token)) score += 15;
      if (topicLower.includes(token)) score += 12;
      if (firstLower.includes(token)) score += 10;
      if (lastLower.includes(token)) score += 5;
      if (allLower.includes(token)) score += 2;
      if (projectLower.includes(token) || cwdLower.includes(token)) score += 3;
    }

    // Phrase scoring (2x multiplier)
    for (const phrase of phrases) {
      if (nameLower.includes(phrase)) score += 30;
      if (topicLower.includes(phrase)) score += 24;
      if (firstLower.includes(phrase)) score += 20;
      if (lastLower.includes(phrase)) score += 10;
      if (allLower.includes(phrase)) score += 4;
      if (projectLower.includes(phrase) || cwdLower.includes(phrase)) score += 6;
    }

    if (score === 0) continue;

    // Recency boost
    const age = now - session.lastTimestamp;
    if (age < ONE_DAY) {
      score *= 1.5;
    } else if (age < ONE_WEEK) {
      score *= 1.2;
    }

    scored.push({ session, score });
  }

  // Sort by most recent first (timestamp desc). Score only determines inclusion, not order.
  scored.sort((a, b) => b.session.lastTimestamp - a.session.lastTimestamp);

  return scored.map((s) => s.session);
}
