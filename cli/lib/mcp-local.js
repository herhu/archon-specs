import fs from "fs-extra";
import path from "path";
import { execSync } from "child_process";
import { config, findProjectRoot, LINEAGE_FILE, JOURNAL_FILE } from "./config.js";
import { extractRegions, mergeRegions } from "./regions.js";
import { runEnterpriseMaterialization } from "./materializer.js";

/**
 * Handles exclusive local MCP content
 */
export async function handleLocalOnly(method, params, id) {
  const root = findProjectRoot();

  if (method === "resources/read" && params?.uri === "archon://local/lineage") {
    if (root) {
      const lineagePath = path.join(root, LINEAGE_FILE);
      const content = await fs.readFile(lineagePath, "utf-8");
      return {
        jsonrpc: "2.0",
        id,
        result: {
          contents: [{ uri: params.uri, mimeType: "application/json", text: content }]
        }
      };
    }
  }

  // Tools Implementation
  if (method === "tools/call") {
    switch (params?.name) {
      case "archon_read_local_lineage":
        if (!root) return { jsonrpc: "2.0", id, error: { code: -32000, message: "No Archon project found." } };
        const lineage = await fs.readJSON(path.join(root, LINEAGE_FILE));
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify({ projectRoot: root, lineage }, null, 2) }] } };

      case "archon_verify_local":
        if (!root) return { jsonrpc: "2.0", id, error: { code: -32000, message: "No Archon project found." } };
        try {
          execSync(`npx archon verify`, { cwd: root, stdio: "pipe" });
          return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `✅ Verification passed for project at ${root}` }] } };
        } catch (e) {
          return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `❌ Verification failed: ${e.message}` }], isError: true } };
        }

      case "archon_sync_via_artifact":
        if (!root) return { jsonrpc: "2.0", id, error: { code: -32000, message: "No Archon project found." } };

        const artifactUrl = params.arguments?.artifactUrl;
        if (!artifactUrl) return { jsonrpc: "2.0", id, error: { code: -32000, message: "Missing artifactUrl." } };

        const tempZip = path.join("/tmp", `archon_sync_${Date.now()}.zip`);
        const tempUnzipDir = path.join("/tmp", `archon_sync_unzip_${Date.now()}`);

        try {
          console.error(`Downloading artifact from ${artifactUrl}...`);
          execSync(`curl -L -o ${tempZip} "${artifactUrl}"`, { stdio: "inherit" });
          
          await fs.ensureDir(tempUnzipDir);
          console.error(`Unzipping to ${tempUnzipDir}...`);
          execSync(`unzip -o ${tempZip} -d ${tempUnzipDir}`, { stdio: "inherit" });
          
          // PHASE: SMART MERGE
          const files = await fs.readdir(tempUnzipDir, { recursive: true });
          for (const file of files) {
            const localFile = path.join(root, file);
            const remoteFile = path.join(tempUnzipDir, file);
            
            if (fs.existsSync(localFile) && !fs.lstatSync(localFile).isDirectory()) {
              const oldContent = await fs.readFile(localFile, "utf-8");
              const newContent = await fs.readFile(remoteFile, "utf-8");
              
              const oldRegions = extractRegions(oldContent);
              if (oldRegions.size > 0) {
                const mergedContent = mergeRegions(oldContent, newContent, file);
                if (mergedContent !== newContent) {
                  await fs.writeFile(remoteFile, mergedContent);
                }
              }
            }
          }

          console.error(`Moving merged files to ${root}...`);
          fs.copySync(tempUnzipDir, root, { overwrite: true });

          fs.removeSync(tempZip);
          fs.removeSync(tempUnzipDir);
          
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: `✅ ARTIFACT SYNC SUCCESS: Files merged and overwritten from ZIP. Manual regions PRESERVED.` }]
            }
          };
        } catch (e) {
          if (fs.existsSync(tempZip)) fs.removeSync(tempZip);
          if (fs.existsSync(tempUnzipDir)) fs.removeSync(tempUnzipDir);
          return { jsonrpc: "2.0", id, error: { code: -32603, message: `Artifact sync failed: ${e.message}` } };
        }


      case "archon_create_requirement_contract":
        try {
          const { outPath, workflowId, ...data } = params.arguments;
          const discoveredRoot = await discoverLocalRoot(workflowId);
          const fullPath = path.resolve(discoveredRoot, outPath);
          console.error(`[TRACE:CLI] 📝 Creating Requirement Contract at: ${fullPath}`);
          await fs.ensureDir(path.dirname(fullPath));
          await fs.writeJSON(fullPath, data, { spaces: 2 });
          console.error(`[TRACE:CLI] ✅ Requirement Contract saved.`);
          return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `✅ Requirement Contract created at ${fullPath}` }] } };
        } catch (e) {
          console.error(`[TRACE:CLI] ❌ Failed to create requirement contract: ${e.message}`);
          return { jsonrpc: "2.0", id, error: { code: -32603, message: `Failed to create requirement contract: ${e.message}` } };
        }

      case "archon_create_architecture_contract":
        try {
          const { outPath, workflowId, ...data } = params.arguments;
          const discoveredRoot = await discoverLocalRoot(workflowId);
          const fullPath = path.resolve(discoveredRoot, outPath);
          console.error(`[TRACE:CLI] 📝 Creating Architecture Contract at: ${fullPath}`);
          await fs.ensureDir(path.dirname(fullPath));
          await fs.writeJSON(fullPath, data, { spaces: 2 });
          console.error(`[TRACE:CLI] ✅ Architecture Contract saved.`);
          return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `✅ Architecture Contract created at ${fullPath}` }] } };
        } catch (e) {
          console.error(`[TRACE:CLI] ❌ Failed to create architecture contract: ${e.message}`);
          return { jsonrpc: "2.0", id, error: { code: -32603, message: `Failed to create architecture contract: ${e.message}` } };
        }

      case "archon_compile_spec_shards":
        try {
          const { specDir, outPath, workflowId } = params.arguments;
          const discoveredRoot = await discoverLocalRoot(workflowId);
          
          const fullSpecDir = path.resolve(discoveredRoot, specDir);
          const fullOutPath = path.resolve(discoveredRoot, outPath);
          
          console.error(`[TRACE:CLI] 🔨 Compiling local shards in ${fullSpecDir}...`);
          
          const spec = { version: "1.0.0", name: "ArchonSpecs", domains: [] };
          const domainsDir = path.join(fullSpecDir, "domains");
          
          if (fs.existsSync(domainsDir)) {
            const files = (await fs.readdir(domainsDir)).filter(f => f.endsWith(".json"));
            for (const file of files) {
              const shardPath = path.join(domainsDir, file);
              const shard = await fs.readJSON(shardPath);
              spec.domains.push(shard);
              console.error(`[TRACE:CLI] 📦 Loaded shard: ${file}`);
            }
          } else {
            console.error(`[TRACE:CLI] ⚠️ Domains directory NOT FOUND: ${domainsDir}`);
          }

          if (spec.domains.length === 0) {
              return { 
                  jsonrpc: "2.0", id, 
                  result: { 
                      content: [{ 
                          type: "text", 
                          text: `🛑 NO SHARDS FOUND.\n\nThe compiler searched in: \`${domainsDir}\`\nDiscovered Root: \`${discoveredRoot}\`\n\n**REASON:** The CLI is currently looking in a directory that contains no .json shards. If you are using LM Studio, ensure you have called \`archon_initialize_workspace\` with an **ABSOLUTE PATH** to your project folder (e.g. /Users/hernan/Desktop/praseo).` 
                      }], 
                      isError: true 
                  } 
              };
          }
          
          // 🛡️ ARCHITECTURE LAYER MERGE — previously this local compile built the spec
          // from domain shards ONLY, silently dropping platform/modules/crossCutting
          // (no Redis/BullMQ/outbox/auth in the generated backend). Merge them here,
          // mirroring the server-side compiler.
          const platformFile = path.join(fullSpecDir, "platform.json");
          if (fs.existsSync(platformFile)) {
            const p = await fs.readJSON(platformFile);
            if (p.platform && Object.keys(p.platform).length) spec.platform = p.platform;
            if (Array.isArray(p.modules) && p.modules.length) spec.modules = p.modules;
            if (Array.isArray(p.handlebarsHelpers) && p.handlebarsHelpers.length) spec.handlebarsHelpers = p.handlebarsHelpers;
            if (p.crossCutting && Object.keys(p.crossCutting).length) spec.crossCutting = p.crossCutting;
            console.error(`[TRACE:CLI] 🧩 Merged platform.json (platform=${!!spec.platform}, modules=${(spec.modules || []).length})`);
          }
          const modulesFile = path.join(fullSpecDir, "modules.json");
          if (fs.existsSync(modulesFile)) {
            const m = await fs.readJSON(modulesFile);
            const arr = Array.isArray(m) ? m : m.modules;
            if (Array.isArray(arr) && arr.length) spec.modules = arr;
            console.error(`[TRACE:CLI] 🧩 Merged modules.json (modules=${(spec.modules || []).length})`);
          }
          const ccFile = path.join(fullSpecDir, "cross-cutting.json");
          if (fs.existsSync(ccFile)) {
            const c = await fs.readJSON(ccFile);
            const cc = c.crossCutting || (c.auth ? c : null);
            if (cc && Object.keys(cc).length) spec.crossCutting = cc;
            console.error(`[TRACE:CLI] 🧩 Merged cross-cutting.json (crossCutting=${!!spec.crossCutting})`);
          }

          // 🔊 LOUD DROP DETECTOR (mirror of the server-side one): architecture files
          // exist but nothing landed in the spec → FAIL, never compile a half-spec.
          const wantsArchitecture = fs.existsSync(platformFile) || fs.existsSync(modulesFile) || fs.existsSync(ccFile);
          if (wantsArchitecture && !spec.platform && !(spec.modules || []).length && !spec.crossCutting) {
            return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `🛑 Architecture layer dropped during local compile: platform.json/modules.json/cross-cutting.json exist but produced no platform/modules/crossCutting in the compiled spec. Check their structure (platform.json: { platform, modules, handlebarsHelpers }; cross-cutting.json: { crossCutting } or { auth }).` }], isError: true } };
          }

          await fs.ensureDir(path.dirname(fullOutPath));
          await fs.writeJSON(fullOutPath, spec, { spaces: 2 });

          // 🛡️ GOVERNANCE: Call remote validator to ensure Phase 2.6 compliance
          console.error(`[TRACE:CLI] 🛡️ Requesting remote validation for compiled spec...`);
          const validationRes = await callRemoteTool("archon_validate_spec", { spec, workflowId });
          
          if (validationRes.isError || validationRes.error) {
             const errorMsg = validationRes.content?.[0]?.text || validationRes.error?.message || "Unknown validation error";
             return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `🛑 REJECTED locally: Spec failed remote Phase 2.6 Validation:\n${errorMsg}` }], isError: true } };
          }

          const fingerprint = validationRes.structuredContent?.fingerprint;
          let statusMessage = `✅ Compiled and Validated locally.\nFingerprint: ${fingerprint}`;

          // 🛡️ SYNC: Advance remote workflow state
          if (workflowId && fingerprint) {
              console.error(`[TRACE:CLI] 🔄 Syncing local spec with remote workflow ${workflowId}...`);
              await callRemoteTool("archon_workflow_sync_manual", { workflowId, spec, fingerprint });
              statusMessage += `\nRemote workflow advanced to SPEC_VALIDATED.`;
          }
          
          return { jsonrpc: "2.0", id, result: { 
              content: [{ type: "text", text: statusMessage }],
              structuredContent: { compiledPath: fullOutPath, domainsCount: spec.domains.length, fingerprint }
          } };
        } catch (e) {
          return { jsonrpc: "2.0", id, error: { code: -32603, message: `Compilation failed: ${e.message}` } };
        }

      case "archon_diff_local":
        if (!root) return { jsonrpc: "2.0", id, error: { code: -32000, message: "No Archon project found." } };
        try {
          const lineage = await fs.readJSON(path.join(root, LINEAGE_FILE));
          const projectId = lineage.projectId || lineage.id;

          // Fetch latest approved spec
          const specRes = await (await fetch(config.postUrl, {
            method: "POST", headers: config.headers,
            body: JSON.stringify({ 
              jsonrpc: "2.0", 
              method: "tools/call", 
              params: { name: "archon_get_current_spec", arguments: { projectId } }, 
              id: "diff_fetch" 
            })
          })).json();

          const remoteSpec = specRes.result?.structuredContent?.spec;
          if (!remoteSpec) throw new Error("Could not retrieve approved spec from remote.");

          // Diff into structured output
          const remoteSpecFile = path.join(root, ".archon/remote_spec.json");
          await fs.writeJSON(remoteSpecFile, remoteSpec, { spaces: 2 });
          
          const output = execSync(`npx archon generate -s .archon/remote_spec.json -p designspec.json -o . --diff --no-qa --json`, { 
            cwd: root, 
            encoding: "utf-8"
          });

          await fs.remove(remoteSpecFile);

          let diffData;
          try {
            diffData = JSON.parse(output.substring(output.indexOf('{')));
          } catch (e) {
            throw new Error(`Failed to parse diff output: ${output}`);
          }

          const created = diffData.results.created.length;
          const updated = diffData.results.updated.length;
          const skipped = diffData.results.skipped.length;
          
          const changedFiles = [...diffData.results.created, ...diffData.results.updated].slice(0, 10);

          return { 
            jsonrpc: "2.0", 
            id, 
            result: { 
              content: [{ 
                type: "text", 
                text: `🔍 **DIFF PREVIEW** (${diffData.mode})\n\n- Files to create: **${created}**\n- Files to update: **${updated}**\n- Files unchanged: **${skipped}**\n\n**Impacted Areas:**\n${diffData.deltas.map(d => `- ${d.type}${d.domainKey ? ': ' + d.domainKey : ''}`).join("\n")}\n\n**Example changes:**\n${changedFiles.map(f => `- ${f}`).join("\n")}${changedFiles.length >= 10 ? "\n- ..." : ""}` 
              }],
              structuredContent: {
                diffResult: diffData
              }
            } 
          };
        } catch (e) {
          return { jsonrpc: "2.0", id, error: { code: -32603, message: `Diff failed: ${e.message}` } };
        }
    }
  }

  return null;
}

/**
 * 🛰️ Helper to discover the local project root
 * Priorities: 
 * 1. .archon/lineage.json (findProjectRoot)
 * 2. Remote Workflow Metadata (targetDir)
 * 3. process.cwd()
 */
async function discoverLocalRoot(workflowId) {
    const root = findProjectRoot();
    if (root) {
        console.error(`[TRACE:CLI] 🧭 Discovered root via lineage: ${root}`);
        return root;
    }

    if (workflowId) {
        console.error(`[TRACE:CLI] 🛰️ Querying remote for workflow ${workflowId} context...`);
        try {
            const status = await callRemoteTool("archon_workflow_status", { workflowId });
            const targetDir = status.structuredContent?.metadata?.targetDir;
            if (targetDir) {
                if (targetDir.includes(".lmstudio/extensions")) {
                    console.error(`[TRACE:CLI] 🛑 WARNING: Workflow is registered to a plugin directory: ${targetDir}. This is likely a mistake. Re-run archon_initialize_workspace with an absolute project path.`);
                }
                console.error(`[TRACE:CLI] 🧭 Discovered root via remote metadata: ${targetDir}`);
                return targetDir;
            }
        } catch (e) {
            console.error(`[TRACE:CLI] ⚠️ Failed to fetch remote metadata: ${e.message}`);
        }
    }

    const fallback = process.cwd();
    console.error(`[TRACE:CLI] ⚠️ Using fallback root (CWD): ${fallback}`);
    return fallback;
}

/**
 * 🛰️ Helper to call tools on the Remote Gateway from local context
 */
async function callRemoteTool(name, args) {
    try {
        const response = await fetch(config.postUrl, {
            method: "POST",
            headers: config.headers,
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "tools/call",
                params: { name, arguments: args },
                id: `local_call_${Date.now()}`
            })
        });
        
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Remote Tool Call Failed (${response.status}): ${text}`);
        }
        
        const data = await response.json();
        if (data.error) throw new Error(data.error.message || "Remote Tool Error");
        return data.result;
    } catch (e) {
        console.error(`[TRACE:CLI] ❌ Remote Call Error (${name}): ${e.message}`);
        return { isError: true, content: [{ type: "text", text: e.message }] };
    }
}
