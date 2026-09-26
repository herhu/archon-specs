import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Local copy — mirrors archon-core's ToolCategory so uml-mcp stays
// self-contained and doesn't create a circular file: dependency.
export enum ToolCategory {
    DISCOVERY  = "DISCOVERY",
    VALIDATION = "VALIDATION",
    PLANNING   = "PLANNING",
    EXECUTION  = "EXECUTION",
    MUTATION   = "MUTATION",
    GOVERNANCE = "GOVERNANCE",
    METRICS    = "METRICS",
    MEMORY     = "MEMORY"
}

export function registerObservedTool(
    server: McpServer,
    name: string,
    definition: {
        description: string;
        inputSchema: any;
        category?: ToolCategory;
        serverName?: string;
    },
    handler: (args: any) => Promise<any>
): void {
    server.tool(
        name,
        definition.description,
        definition.inputSchema,
        async (args: any) => {
            const serverName = definition.serverName ?? "uml-mcp";
            const startTime  = Date.now();

            // Strip internal trace metadata injected by archon-core's transport
            const { _traceId, _userId, _apiKeyId, ...cleanArgs } = args as any;

            process.stderr.write(
                `[MCP-DEBUG] [${serverName}] Tool Started: ${name}\n`
            );

            try {
                const result   = await handler(cleanArgs);
                const duration = Date.now() - startTime;
                const status   = (result as any).isError ? "FAILED" : "SUCCESS";
                process.stderr.write(
                    `[MCP-DEBUG] [${serverName}] Tool Completed: ${name} in ${duration}ms (status: ${status})\n`
                );
                return result;
            } catch (error: any) {
                const duration = Date.now() - startTime;
                process.stderr.write(
                    `[MCP-DEBUG] [${serverName}] Tool Failed: ${name} in ${duration}ms (error: ${error.message})\n`
                );
                throw error;
            }
        }
    );
}
