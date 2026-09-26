#!/usr/bin/env node

import fs from "fs-extra";
import { config, initConfig, findProjectRoot, saveConfig } from "../lib/config.js";
import { setupMcpProxy } from "../lib/mcp-proxy.js";

/**
 * CLI Entrypoint: Dispatch between MCP Bridge and Standalone Commands
 */
async function main() {
  const args = process.argv.slice(2);

  // 0. Handle Version and Help
  if (args.includes("-v") || args.includes("--version")) {
    const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url)));
    console.log(`archonspecs version ${pkg.version}`);
    process.exit(0);
  }

  if (args.includes("-h") || args.includes("--help")) {
    console.log(`
Archon Specs CLI - The Agentic Architectural Engine

Usage:
  archonspecs -token <your-api-key>      Save your API token locally
  archonspecs materialize <projectId>    Trigger remote materialization
  archonspecs <REMOTE_SSE_URL>          Start MCP Bridge (Standard Proxy mode)

Options:
  -v, --version                         Show version
  -h, --help                            Show this help message
  -token, --token <token>               Set API token
  --outDir <dir>                        Target directory for materialization
  --key <shortKey>                      Use a specific materialization key
`);
    process.exit(0);
  }
  
  // 1. Handle Token Configuration
  const tokenIdx = args.findIndex(a => a === "-token" || a === "--token");
  if (tokenIdx !== -1) {
    const token = args[tokenIdx + 1];
    if (!token) {
      console.error("❌ Error: Please provide a token value. Usage: archonspecs -token <your-api-key>");
      process.exit(1);
    }
    const success = saveConfig({ token });
    if (success) {
      console.error("✅ Success: Token saved to .archon/config.json");
    }
    process.exit(success ? 0 : 1);
  }

  console.error('[TRACE:CLIENT:cli] Starting Archon MCP Client...');
  initConfig();
  
  const isMaterializeMode = args[0] === "materialize";

  if (isMaterializeMode) {
    const projectId = args[1];
    const outDirArgIdx = args.indexOf("--outDir");
    const outDir = (outDirArgIdx !== -1 && args[outDirArgIdx + 1]) || findProjectRoot() || process.cwd();
    
    const keyArgIdx = args.indexOf("--key");
    const key = (keyArgIdx !== -1 && args[keyArgIdx + 1]) || null;
    
    if (!projectId) {
      console.error("Usage: archonspecs materialize <projectId|workflowId> [--key <shortKey>] [--url <url>] [--outDir <dir>]");
      process.exit(1);
    }

    try {
      console.error(`[Archon] Materializing project ${projectId}...`);
      if (key) console.error(`[Archon] Using materialization key: ${key}`);
      
      // 1. Establish SSE Stream (Non-blocking but we track completion)
      let resolveMaterialization;
      const materializationComplete = new Promise(resolve => { resolveMaterialization = resolve; });
      let appliedCount = 0;

      const connectSse = async () => {
        try {
          console.error(`[Archon Socket] Connecting to materialization stream: ${config.sseUrl}`);
          const response = await fetch(config.sseUrl, {
            headers: { ...config.headers, "Accept": "text/event-stream" }
          });

          if (!response.ok) throw new Error(`SSE Failed: ${response.status}`);
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let sseBuffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const parts = sseBuffer.split("\n\n");
            sseBuffer = parts.pop() || "";

            for (const part of parts) {
              if (part.includes("event: PLAN_STREAM_COMMITTED")) {
                resolveMaterialization(appliedCount);
                return;
              }
              
              if (part.includes("data: ")) {
                try {
                  const rawData = part.split("data: ")[1];
                  const notification = JSON.parse(rawData);
                  const op = (notification.operation || notification.params?.operation || notification);
                  
                  if (op && op.type && op.path) {
                    const fs = await import("fs-extra");
                    const path = await import("path");
                    const effectiveRoot = op.targetDir || outDir;
                    const filePath = path.isAbsolute(op.path) ? op.path : path.join(effectiveRoot, op.path);
                    
                    if (op.type === 'create' || op.type === 'update') {
                      await fs.ensureDir(path.dirname(filePath));
                      await fs.writeFile(filePath, op.content);
                      console.error(`[TRACE:CLI] 📝 Applied ${op.type}: ${filePath}`);
                      appliedCount++;
                    } else if (op.type === 'delete') {
                      await fs.remove(filePath);
                      console.error(`[TRACE:CLI] 🗑️ Deleted: ${filePath}`);
                      appliedCount++;
                    }
                  }
                } catch (e) {}
              }
            }
          }
        } catch (e) {
          console.error(`[Archon Socket] SSE Error: ${e.message}`);
          resolveMaterialization(appliedCount);
        }
      };

      // Start SSE listener
      connectSse();

      // 2. Trigger Remote Materialization
      const response = await fetch(config.postUrl, {
        method: "POST", headers: config.headers,
        body: JSON.stringify({ 
          jsonrpc: "2.0", 
          method: "tools/call", 
          params: { name: "archon_workflow_materialize", arguments: { workflowId: projectId, outDir } }, 
          id: "mat_cli" 
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server Handshake Failed (${response.status}): ${text}`);
      }

      const contentType = response.headers.get("content-type");
      if (contentType && !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(`Invalid Server Response: Expected JSON but received ${contentType}. \n\nRaw Response:\n${text.substring(0, 500)}`);
      }

      const matRes = await response.json();
      if (process.env.DEBUG) console.error(`[DEBUG] Handshake Response:`, JSON.stringify(matRes, null, 2));

      if (matRes.error) {
        throw new Error(`Server Logic Error: ${matRes.error.message || JSON.stringify(matRes.error)}`);
      }

      // 3. Wait for Stream to Commit
      await materializationComplete;
      console.error(`\n✅ SUCCESS: Materialized ${appliedCount} operations via Real-Time Stream.`);
      process.exit(0);
    } catch (e) {
      console.error(`\n❌ ERROR: ${e.message || e}`);
      if (e.stack && process.env.DEBUG) console.error(e.stack);
      process.exit(1);
    }
  }

  // DEFAULT: MCP Proxy Mode (Standard Input/Output)
  console.error('[TRACE:CLIENT:cli] Dispatching to setupMcpProxy...');
  setupMcpProxy();
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
