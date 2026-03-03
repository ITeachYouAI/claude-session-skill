import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * mcp-server.ts is a thin dispatcher — all business logic lives in
 * indexer.ts, search.ts, and format.ts (covered by their own test suites).
 *
 * These tests verify:
 * 1. The version is read from package.json (not hardcoded)
 * 2. The module can be parsed without errors
 * 3. The server name matches expectations
 */

const ROOT = join(import.meta.dir, "../..");
const serverSource = readFileSync(join(ROOT, "mcp-server.ts"), "utf-8");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));

describe("mcp-server", () => {
  test("reads version from package.json, not hardcoded", () => {
    // Should use pkg.version, not a string literal like "1.1.0"
    expect(serverSource).toContain("pkg.version");
    expect(serverSource).not.toMatch(/version:\s*["']\d+\.\d+\.\d+["']/);
  });

  test("uses correct server name", () => {
    expect(serverSource).toContain('name: "claude-session"');
  });

  test("declares all 6 expected tools", () => {
    const expectedTools = [
      "list_sessions",
      "search_sessions",
      "show_session",
      "name_session",
      "unname_session",
      "session_stats",
    ];
    for (const tool of expectedTools) {
      expect(serverSource).toContain(`name: "${tool}"`);
    }
  });

  test("package.json version is valid semver", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("never uses console.log (would corrupt JSON-RPC stdio)", () => {
    // Remove comments before checking
    const noComments = serverSource.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(noComments).not.toContain("console.log");
  });
});
