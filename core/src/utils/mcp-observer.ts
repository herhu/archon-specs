import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { TelemetryEmitter } from '../core/telemetry/telemetry';
import { TraceManager } from '../core/telemetry/trace-context';
import { ToolCategory } from '../core/telemetry/telemetry-schema';

export function registerObservedTool(
    server: any, 
    name: string,
    definition: {
        description: string;
        inputSchema: any;
        category?: ToolCategory;
        serverName?: string;
    },
    handler: (args: any, extra: { traceId: string, userId: string, apiKeyId: string, server: McpServer }) => Promise<any>
) {
    (server as McpServer).tool(
        name,
        definition.description,
        definition.inputSchema,
        async (args: any) => {
            const traceId = (args as any)._traceId || TraceManager.createRoot().traceId;
            const userId = (args as any)._userId || "unknown-user";
            const apiKeyId = (args as any)._apiKeyId || "unknown-api-key";
            const startTime = Date.now();
            const serverName = definition.serverName || 'unknown-server';
            const toolCategory = definition.category;

            // Remove internal metadata from args to keep it clean for the handler
            const { _traceId, _userId, _apiKeyId, ...cleanArgs } = args as any;

            // MCP Debugging Compliance: Structured log to stderr
            process.stderr.write(`[MCP-DEBUG] [${serverName}] Tool Started: ${name} (traceId: ${traceId}, userId: ${userId})\n`);
            process.stderr.write(`[MCP-DEBUG] Arguments: ${JSON.stringify(cleanArgs)}\n`);

            const spanId = TelemetryEmitter.logMcpToolStarted(traceId, name, cleanArgs, {
                serverName,
                toolCategory
            });

            try {
                const result = await handler(cleanArgs, { traceId, userId, apiKeyId, server: server as McpServer });
                const duration = Date.now() - startTime;
                
                const status = (result as any).isError ? 'FAILED' : 'SUCCESS';
                process.stderr.write(`[MCP-DEBUG] [${serverName}] Tool Completed: ${name} in ${duration}ms (status: ${status})\n`);
                
                TelemetryEmitter.logMcpToolCompleted(traceId, name, duration, status, spanId);
                
                return result;
            } catch (error: any) {
                const duration = Date.now() - startTime;
                process.stderr.write(`[MCP-DEBUG] [${serverName}] Tool Failed: ${name} (error: ${error.message})\n`);
                
                TelemetryEmitter.logMcpToolFailed(traceId, name, error.message, duration, spanId);
                throw error;
            }
        }
    );
}
