import fs from "fs-extra";
import path from "path";
import { config, findProjectRoot } from "./config.js";
import { handleLocalOnly } from "./mcp-local.js";

export function setupMcpProxy() {
  let buffer = "";
  process.stdin.setEncoding("utf8");

  // 🌊 PHYSICAL LAYER: Establish background SSE "Socket" for materialization
  // This fulfills the 'Materializer' role from WORKFLOW.md
  const connectSse = async () => {
    try {
      console.error(`[Archon Socket] Connecting to materialization stream: ${config.sseUrl}`);
      const response = await fetch(config.sseUrl, {
        headers: { ...config.headers, "Accept": "text/event-stream" }
      });

      if (!response.ok) {
        console.error(`[Archon Socket] SSE Connection Failed: ${response.status}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Stream ended CLEANLY (e.g. Cloudflare idle close). Previously this just
          // broke out and the materializer socket died forever — so every later
          // operation_ready had no listener ("No active connection … dropped" on the
          // server). The reconnect below (outside the try) re-establishes it.
          console.error("[Archon Socket] SSE stream ended (clean close).");
          break;
        }

        sseBuffer += decoder.decode(value, { stream: true });
        const parts = sseBuffer.split("\n\n");
        sseBuffer = parts.pop() || "";

        for (const part of parts) {
          if (part.includes(": keepalive")) continue;

          // Handle Dynamic Endpoint Resolution
          if (part.includes("event: endpoint")) {
            const dataLine = part.split("\n").find(l => l.startsWith("data: "));
            if (dataLine) {
              const remoteEndpoint = dataLine.replace("data: ", "").trim();
              console.error(`[Archon Socket] 🔗 Resolved Remote Endpoint: ${remoteEndpoint}`);
              config.postUrl = remoteEndpoint;
            }
            continue;
          }

          // Handle Operation Ready Notifications
          if (part.includes("data: ")) {
            const eventLine = part.split("\n").find(l => l.startsWith("event: "));
            const eventType = eventLine ? eventLine.replace("event: ", "").trim() : "message";
            
            try {
              const rawData = part.split("data: ")[1];
              const notification = JSON.parse(rawData);
              
              console.error(`[TRACE:CLIENT:mcp-proxy] 🌊 SSE Event Received: ${eventType}. Data keys: ${Object.keys(notification).join(", ")}`);
              
              // 🧪 OPERATION DETECTION: Standardized from stream-manager.ts
              // The 'notification' here is the 'data' passed to streamManager.emit()
              const op = (notification.operation || notification.params?.operation || notification);
              
              if (op && op.type && op.path) {
                const root = findProjectRoot() || process.cwd();
                
                // 🧭 PATH RESOLUTION: Favor targetDir from notification if present (for bootstrap)
                const effectiveRoot = op.targetDir || root;
                const filePath = path.isAbsolute(op.path) ? op.path : path.join(effectiveRoot, op.path);
                
                console.error(`[TRACE:CLIENT:mcp-proxy] 📦 Operation details: path=${op.path}, type=${op.type}, target=${filePath}`);

                if (op.type === 'create' || op.type === 'update') {
                  await fs.ensureDir(path.dirname(filePath));
                  await fs.writeFile(filePath, op.content);
                  console.error(`[TRACE:CLIENT:mcp-proxy] ✅ Applied ${op.type}: ${filePath}`);
                } else if (op.type === 'delete') {
                  await fs.remove(filePath);
                  console.error(`[TRACE:CLIENT:mcp-proxy] 🗑️ Deleted: ${filePath}`);
                }
              } else if (eventType === 'PLAN_OPERATION_READY') {
                console.error(`[TRACE:CLIENT:mcp-proxy] WARN: Received PLAN_OPERATION_READY but could not extract operation object. notification keys: ${Object.keys(notification)}`);
              }
            } catch (e) {
              console.error(`[TRACE:CLIENT:mcp-proxy] ERROR: Failed to parse SSE data: ${e.message}. Raw part: ${part}`);
            }
          }
        }
      }
    } catch (e) {
      console.error(`[Archon Socket] SSE Stream Error: ${e.message}.`);
    }
    // ALWAYS reconnect — on clean close (done) AND on error. The materializer socket
    // must stay alive for the lifetime of the bridge, or streamed files are lost.
    setTimeout(connectSse, 2000);
  };

  // Start the background listener (Non-blocking)
  setImmediate(() => connectSse());

  process.stdin.on("data", async (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    // The last element is either an empty string (if input ended in \n) 
    // or a partial line (if it didn't). Save it back to the buffer.
    buffer = lines.pop() || "";

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      
      let request;
      try {
        request = JSON.parse(line);
      } catch (parseError) {
        console.error(`[Archon Proxy] [PARSE-ERROR] Failed to parse: ${line.substring(0, 100)}`);
        // If we can't parse the request, we can't send a response with a matching ID,
        // but we should at least log it. Standard JSON-RPC says to return code -32700.
        continue;
      }

      try {
        console.error(`[Archon Proxy] [IN] ${request.method} (id: ${request.id})`);
        
        const root = findProjectRoot();
        const hasProject = !!root;

        // 1. Try handling locally for exclusive tools/resources
        const localResponse = await handleLocalOnly(request.method, request.params, request.id);
        if (localResponse) {
          console.error(`[Archon Proxy] [OUT-LOCAL] ${request.method}`);
          process.stdout.write(JSON.stringify(localResponse) + "\n");
          continue;
        }

        // 2. Proxy to Remote
        if (!request.method) {
          console.error(`[Archon Proxy] [TRACE] Skipping request missing method: ${line}`);
          continue;
        }

        console.error(`[Archon Proxy] [TRACE] Proxying ${request.method} to ${config.postUrl}`);
        let responseJson;
        try {
          const res = await fetch(config.postUrl, {
            method: "POST",
            headers: config.headers,
            body: JSON.stringify(request),
          });

          if (!res.ok) {
            const errorText = await res.text();
            console.error(`[Archon Proxy] [TRACE] Remote Error ${res.status}: ${errorText}`);
            process.stdout.write(JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              error: { code: -32603, message: `Remote Gateway Error (${res.status}): ${errorText}` }
            }) + "\n");
            continue;
          }

          const contentType = res.headers.get("content-type");
          if (contentType && !contentType.includes("application/json")) {
             const text = await res.text();
             console.error(`[Archon Proxy] [TRACE] Content-Type Mismatch: ${contentType}`);
             process.stdout.write(JSON.stringify({
               jsonrpc: "2.0",
               id: request.id,
               error: { code: -32603, message: "Remote Gateway returned non-JSON response." }
             }) + "\n");
             continue;
          }

          const responseText = await res.text();
          console.error(`[Archon Proxy] [TRACE] Raw Response Text: ${responseText.substring(0, 200)}...`);
          
          // Handle Notifications: They don't expect a response in JSON-RPC stdio
          if (request.id === undefined) {
              console.error(`[Archon Proxy] [TRACE] Notification processed. Skipping stdout.`);
              continue;
          }

          if (!responseText || responseText.trim() === "") {
              console.error(`[Archon Proxy] [TRACE] Received empty response for request ${request.id}`);
              continue;
          }

          try {
            responseJson = JSON.parse(responseText);
          } catch (e) {
            console.error(`[Archon Proxy] [TRACE] JSON Parse Error: ${e.message}`);
            process.stdout.write(JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              error: { code: -32603, message: "Remote Gateway returned invalid JSON." }
            }) + "\n");
            continue;
          }
          console.error(`[Archon Proxy] [TRACE] Parsed Response: ${JSON.stringify(responseJson).substring(0, 100)}...`);
        } catch (fetchError) {
          console.error(`[Archon Proxy] [TRACE] Fetch Failed: ${fetchError.message}`);
          process.stdout.write(JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32603, message: `Proxy Fetch Error: ${fetchError.message}` }
          }) + "\n");
          continue;
        }

        // 3. Post-Process Responses
        // Note: Individual file materialization for archon_initialize_workspace 
        // is now handled by the background SSE socket!

        // 4. Augment / Filter Response
        if (request.method === "resources/list" && responseJson.result) {
          if (hasProject) {
            responseJson.result.resources.push({
              uri: "archon://local/lineage",
              name: "Local Archon Lineage",
              description: "CRITICAL: The immutable lineage of this project. Contains projectId and revisionId.",
              mimeType: "application/json"
            });
          }
        }

        if (request.method === "tools/list" && responseJson.result) {
          // Define local overrides
          const localOverrides = [
            { 
              name: "archon_read_local_lineage", 
              description: "Read the local lineage manifest. Use this to find the projectId and current revisionId before initiating architectural changes.", 
              inputSchema: { type: "object", properties: {} } 
            },
            { 
              name: "archon_verify_local", 
              description: "Verify local code integrity against the lineage manifest. Ensures no unauthorized drift occurred.", 
              inputSchema: { type: "object", properties: {} } 
            },
            { 
              name: "archon_diff_local", 
              description: "Preview architectural changes before applying them. Recommended before running sync.", 
              inputSchema: { type: "object", properties: {} } 
            },
            {
              name: "archon_create_requirement_contract",
              description: "Create a Requirement Contract shard locally.",
              inputSchema: {
                type: "object",
                properties: {
                  outPath: { type: "string", description: "Path to write (e.g. spec/manifest.json)" },
                  version: { type: "string" },
                  businessRules: { type: "array", items: { type: "string" } },
                  actors: { type: "array", items: { type: "object" } },
                  invariants: { type: "array", items: { type: "string" } },
                  events: { type: "array", items: { type: "string" } },
                  workflowId: { type: "string", description: "The active workflow ID for context discovery" }
                },
                required: ["outPath", "version", "businessRules", "actors", "invariants", "events"]
              }
            },
            {
              name: "archon_create_architecture_contract",
              description: "Create an Architecture Contract shard locally. Declare platform capabilities, injected modules and cross-cutting concerns HERE — they are merged into the compiled DesignSpec.",
              inputSchema: {
                type: "object",
                properties: {
                  outPath: { type: "string" },
                  version: { type: "string" },
                  domainShards: { type: "array", items: { type: "string" } },
                  platform: { type: "object", description: "Platform capability flags (cors, swagger, throttling, sonarQube, githubActions, …)" },
                  modules: { type: "array", items: { type: "object" }, description: "Injected modules: { type: 'cache.redis'|'queue.bullmq'|'db-transactions', name }" },
                  crossCutting: { type: "object", description: "Cross-cutting concerns, e.g. { auth: { jwt: { issuer, audience } } }" },
                  handlebarsHelpers: { type: "array", items: { type: "string" } },
                  workflowId: { type: "string", description: "The active workflow ID for context discovery" }
                },
                required: ["outPath", "version", "domainShards"]
              }
            },
            {
              name: "archon_compile_spec_shards",
              description: "Compile local spec shards into a single DesignSpec.json.",
              inputSchema: {
                type: "object",
                properties: {
                  specDir: { type: "string" },
                  outPath: { type: "string" },
                  workflowId: { type: "string", description: "The active workflow ID for context discovery" }
                },
                required: ["specDir", "outPath"]
              }
            }
          ];

          // DEDUPLICATION: Remove remote tools that we are overriding locally
          const overrideNames = localOverrides.map(t => t.name);
          responseJson.result.tools = responseJson.result.tools.filter(t => !overrideNames.includes(t.name));

          // Add Local Tools
          responseJson.result.tools.push(...localOverrides);

          // Add Sync via Artifact (Only if not already present)
          if (!responseJson.result.tools.find(t => t.name === "archon_sync_via_artifact")) {
            responseJson.result.tools.push({
              name: "archon_sync_via_artifact",
              description: "SMART ARTIFACT SYNC: Downloads a generation ZIP artifact and performs a region-aware merge into the current workspace. Preserves all manual code blocks (// @archon-manual-start) and @ArchonManual() decorated methods. Use this if the spec-driven flow fails or to synchronize with a remote build while keeping local customizations.",
              inputSchema: {
                type: "object",
                properties: {
                  artifactUrl: { type: "string", description: "The pre-signed S3 download URL for the project ZIP" }
                },
                required: ["artifactUrl"]
              }
            });
          }

          // PHASE FILTERING
          if (!hasProject) {
            responseJson.result.tools = responseJson.result.tools.filter(t => 
              !["archon_add_domain", "archon_add_entity", "archon_patch_spec", "archon_diff_local", "archon_verify_local", "archon_read_local_lineage", "archon_sync_via_artifact"].includes(t.name)
            );
          }
        }

        process.stdout.write(JSON.stringify(responseJson) + "\n");
      } catch (e) {
        console.error("[Archon Proxy] Fatal JSON-RPC Error:", e.message);
        // Ensure we at least send something back if we can
        try {
           const request = JSON.parse(line);
           process.stdout.write(JSON.stringify({
             jsonrpc: "2.0",
             id: request.id,
             error: { code: -32603, message: `Fatal Proxy Error: ${e.message}` }
           }) + "\n");
        } catch {}
      }
    }
  });

  process.stdin.on("end", () => {
    process.exit(0);
  });
}
