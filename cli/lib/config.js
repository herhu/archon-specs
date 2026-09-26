import fs from "fs-extra";
import path from "path";

// Load local .env file manually (Dependency-free logic)
try {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        const value = valueParts.join("=");
        if (key && value !== undefined) {
          process.env[key.trim()] = value.trim();
        }
      }
    });
  }
} catch (e) {
  // Silent fail if .env is unreadable
}

export const LINEAGE_FILE = ".archon/lineage.json";
export const LOCK_FILE = ".archon/sync.lock";
export const SPEC_FILE = "designspec.json";
export const JOURNAL_FILE = ".archon/sync.journal";

export let config = {
  sseUrl: "",
  postUrl: "",
  headers: {}
};

/**
 * Finds the project root by walking up from CWD
 */
export function findProjectRoot(start = process.cwd()) {
  let curr = start;
  while (curr !== path.parse(curr).root) {
    if (fs.existsSync(path.join(curr, LINEAGE_FILE))) return curr;
    curr = path.dirname(curr);
  }
  return null;
}

export function initConfig() {
  const args = process.argv.slice(2);
  const isMaterializeMode = args[0] === "materialize";

  let sseUrl = null;
  let token = process.env.ARCHON_TOKEN;
  
  // 1. Load from local .archon/config.json if it exists
  const root = findProjectRoot() || process.cwd();
  const localConfigPath = path.join(root, ".archon/config.json");
  if (fs.existsSync(localConfigPath)) {
    try {
      const localConfig = fs.readJSONSync(localConfigPath);
      if (localConfig.url) sseUrl = localConfig.url;
      if (localConfig.token) token = localConfig.token;
    } catch (e) {}
  }

  // 2. Parse --url from args OR find any http argument
  const urlIdx = args.indexOf("--url");
  if (urlIdx !== -1 && args[urlIdx + 1]) {
    sseUrl = args[urlIdx + 1];
  } else {
    const urlArg = args.find(a => a && a.startsWith("http"));
    if (urlArg) sseUrl = urlArg;
  }

  // 3. SECONDARY FALLBACK: Try to find in global Antigravity/MCP config
  if (!sseUrl || sseUrl.includes("localhost")) {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir) {
        const mcpConfigPath = path.join(homeDir, ".gemini/antigravity/mcp_config.json");
        if (fs.existsSync(mcpConfigPath)) {
            try {
                const mcpConfig = fs.readJSONSync(mcpConfigPath);
                const archonSrv = mcpConfig.mcpServers?.["archon-governance"];
                if (archonSrv && archonSrv.args) {
                    const urlArg = archonSrv.args.find(a => a.startsWith("http"));
                    if (urlArg) {
                        sseUrl = urlArg;
                        console.error(`[TRACE:CLIENT:config] Auto-discovered URL from mcp_config.json`);
                    }
                }
            } catch (e) {}
        }
    }
  }

  sseUrl = sseUrl || "https://archonspecs.dev/mcp/sse";

  const urlObj = new URL(sseUrl);
  const urlApiKey = urlObj.searchParams.get("apiKey");

  // If apiKey is in URL, we prioritize it and don't strictly need the Bearer token
  // unless specifically provided.
  const authHeader = token && token !== "your_api_key_here" ? `Bearer ${token}` : undefined;
  const headers = { "Content-Type": "application/json" };
  if (authHeader) headers["Authorization"] = authHeader;

  // Construct POST URL by replacing /sse with /mcp if applicable, or just removing /sse
  let postUrl = sseUrl.includes("/mcp/sse") 
    ? sseUrl.replace("/mcp/sse", "/mcp") 
    : sseUrl.replace("/sse", "/mcp");
    
  const postUrlObj = new URL(postUrl);
  
  // Ensure apiKey is propagated if found in the original sseUrl
  if (urlApiKey && !postUrlObj.searchParams.has("apiKey")) {
    postUrlObj.searchParams.set("apiKey", urlApiKey);
  }

  config.sseUrl = sseUrl;
  config.postUrl = postUrlObj.toString();
  config.headers = headers;

  console.error(`[TRACE:CLIENT:config] SSE URL: ${config.sseUrl}`);
  console.error(`[TRACE:CLIENT:config] POST URL: ${config.postUrl}`);
  console.error(`[TRACE:CLIENT:config] Auth Header Present: ${!!authHeader}`);
}

/**
 * Saves configuration (like tokens) to the project's .archon/config.json
 */
export function saveConfig(newConfig) {
  const root = findProjectRoot() || process.cwd();
  const configDir = path.join(root, ".archon");
  const configPath = path.join(configDir, "config.json");

  try {
    fs.ensureDirSync(configDir);
    let existing = {};
    if (fs.existsSync(configPath)) {
      existing = fs.readJSONSync(configPath);
    }
    
    const merged = { ...existing, ...newConfig };
    fs.writeJSONSync(configPath, merged, { spaces: 2 });
    console.error(`[TRACE:CLIENT:config] Configuration updated at ${configPath}`);
    return true;
  } catch (e) {
    console.error(`[TRACE:CLIENT:config] Failed to save configuration: ${e.message}`);
    return false;
  }
}

/**
 * Notification Bridge: Push local progress to remote dashboard
 */
export async function sendNotification(method, params) {
  try {
    await fetch(config.postUrl, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: method,
        params: params
      }),
    });
  } catch (e) {
    // Silent fail for notifications
  }
}
