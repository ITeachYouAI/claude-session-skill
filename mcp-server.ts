#!/usr/bin/env bun

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./lib/create-server";

// NEVER use console.log() — corrupts JSON-RPC stdio stream.
// Only process.stderr (debug) is safe.

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
