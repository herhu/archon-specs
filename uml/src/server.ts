import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";
export { registerTools };
import { registerPrompts } from "./prompts/index.js";

export function createUmlServer() {
  const server = new McpServer({
    name: "uml-mcp",
    version: "1.0.0",
  });

  process.stderr.write("[UML] Registering tools v1.0.0 (Deep-Visibility Observability)...\n");
  registerTools(server);
  registerPrompts(server);

  return server;
}
