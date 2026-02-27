#!/usr/bin/env bun

import { buildIndex, nameSession } from "./lib/indexer";
import { searchSessions } from "./lib/search";
import {
  formatSessionList,
  formatSearchResults,
  formatSessionDetail,
  formatStats,
} from "./lib/format";

const args = process.argv.slice(2);
const command = args[0] || "help";

async function main() {
  switch (command) {
    case "list": {
      const showAll = args.includes("--all");
      const sessions = await buildIndex();
      console.log(formatSessionList(sessions, showAll));
      break;
    }

    case "show": {
      const partial = args[1];
      if (!partial) {
        console.error("Usage: session show <session-id-or-prefix>");
        process.exit(1);
      }
      const sessions = await buildIndex();
      const match = sessions.find(
        (s) => s.id === partial || s.id.startsWith(partial)
      );
      if (!match) {
        console.error(`No session found matching "${partial}"`);
        process.exit(1);
      }
      console.log(formatSessionDetail(match));
      break;
    }

    case "rebuild": {
      const t0 = performance.now();
      const sessions = await buildIndex(true);
      const elapsed = Math.round(performance.now() - t0);
      console.log(`Index rebuilt: ${sessions.length} sessions in ${elapsed}ms`);
      break;
    }

    case "stats": {
      const sessions = await buildIndex();
      console.log(formatStats(sessions));
      break;
    }

    case "name": {
      const rest = args.slice(1);
      if (rest.length === 0) {
        console.error("Usage: session name <name>\n       session name <id> <name>");
        process.exit(1);
      }

      // Heuristic: if first arg looks like a UUID prefix (8+ hex with optional UUID segments)
      const first = rest[0];
      const looksLikeId = /^[0-9a-f]{8}(-[0-9a-f]{4}(-[0-9a-f]{4}(-[0-9a-f]{4}(-[0-9a-f]{12})?)?)?)?$/i.test(first);

      let sessionId: string;
      let sessionName: string;

      if (looksLikeId && rest.length > 1) {
        sessionId = first;
        sessionName = rest.slice(1).join(" ");
      } else {
        // Name the most recent session
        const sessions = await buildIndex();
        if (sessions.length === 0) {
          console.error("No sessions found.");
          process.exit(1);
        }
        sessionId = sessions[0].id;
        sessionName = rest.join(" ");
      }

      const result = await nameSession(sessionId, sessionName);
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }
      console.log(`Named session ${(result.fullId ?? "").slice(0, 8)}... → "${sessionName.trim()}"`);
      break;
    }

    case "search": {
      const query = args.slice(1).join(" ");
      if (!query) {
        console.error("Usage: session search <query>");
        process.exit(1);
      }
      const sessions = await buildIndex();
      const results = searchSessions(sessions, query);
      console.log(formatSearchResults(results, query));
      break;
    }

    case "help":
    default: {
      // If it's not a known command, treat it as a search query
      if (command !== "help" && command !== "--help" && command !== "-h") {
        const query = args.join(" ");
        const sessions = await buildIndex();
        const results = searchSessions(sessions, query);
        console.log(formatSearchResults(results, query));
      } else {
        console.log(`Usage:
  session <query>          Search sessions by keyword
  session list [--all]     Show recent sessions (default: 20)
  session show <id>        Show session details (partial ID ok)
  session name <name>      Name the most recent session
  session name <id> <name> Name a specific session (partial ID ok)
  session search <query>   Search sessions by keyword
  session rebuild          Force rebuild the index
  session stats            Show index statistics`);
      }
      break;
    }
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
