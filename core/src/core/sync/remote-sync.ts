import * as fs from 'fs-extra';
import * as path from 'path';

export async function syncRemoteState(newState: string) {
    try {
        const root = process.cwd();
        const configPath = path.join(root, '.archon', 'config.json');
        const lineagePath = path.join(root, '.archon', 'lineage.json');

        if (!fs.existsSync(configPath) || !fs.existsSync(lineagePath)) {
            // Not a fully initialized remote project, skip sync
            return;
        }

        const config = await fs.readJSON(configPath);
        const lineage = await fs.readJSON(lineagePath);

        const projectId = lineage.projectId || lineage.id;
        const postUrl = config.url ? config.url.replace('/mcp/sse', '/mcp') : null;

        if (!projectId || !postUrl) return;

        const urlObj = new URL(postUrl);
        if (config.apiKey && !urlObj.searchParams.has('apiKey')) {
            urlObj.searchParams.set('apiKey', config.apiKey);
        }

        const headers: Record<string, string> = { "Content-Type": "application/json" };

        await fetch(urlObj.toString(), {
            method: "POST",
            headers,
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "tools/call",
                params: {
                    name: "archon_workflow_continue",
                    arguments: {
                        workflowId: projectId,
                        nextState: newState
                    }
                },
                id: "cli_auto_sync"
            })
        });

    } catch (e) {
        // Silent fail for telemetry/sync
    }
}
