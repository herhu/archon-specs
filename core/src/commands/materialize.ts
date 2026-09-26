import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { StreamMaterializer } from '../core/engine/stream-materializer';
import { PlanStreamEvent, StreamedExecutionOperation } from '../core/engine/execution-plan';
import { TelemetryEmitter } from '../core/telemetry/telemetry';

export async function materializeCommand(workflowId: string) {
    const root = process.cwd();
    const configPath = path.join(root, '.archon', 'config.json');

    if (!fs.existsSync(configPath)) {
        console.error(chalk.red('Error: .archon/config.json not found. Run "archon init" with a remote URL first.'));
        process.exit(1);
    }

    const config = await fs.readJSON(configPath);
    if (!config.url || !config.apiKey) {
        console.error(chalk.red('Error: Missing url or apiKey in .archon/config.json'));
        process.exit(1);
    }

    console.error(chalk.blue(`🚀 Materializing workflow: ${workflowId}`));
    console.error(chalk.gray(`Connection: ${config.url}`));

    const mat = new StreamMaterializer(root);
    
    // SSE Implementation via fetch
    try {
        const url = new URL(config.url);
        url.searchParams.set('apiKey', config.apiKey);
        
        const response = await fetch(url.toString(), {
            headers: { 'Accept': 'text/event-stream' }
        });

        if (!response.ok || !response.body) {
            throw new Error(`Failed to connect: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEventType = '';

        console.error(chalk.yellow('📡 Listening for remote operations...'));

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('event: ')) {
                    currentEventType = line.substring(7).trim();
                } else if (line.startsWith('data: ')) {
                    const data = JSON.parse(line.substring(6));
                    await handleEvent({ type: currentEventType, data }, mat, workflowId);
                }
            }
        }

    } catch (err: any) {
        console.error(chalk.red(`❌ Materialization failed: ${err.message}`));
        process.exit(1);
    }
}

async function handleEvent(event: any, mat: StreamMaterializer, workflowId: string) {
    const { type, data } = event;

    switch (type) {
        case PlanStreamEvent.STARTED:
            if (data.planId === workflowId) {
                console.error(chalk.green(`✅ Stream Started: ${data.projectName}`));
                let fingerprint = 'init';
                try {
                    if (fs.existsSync(path.join(process.cwd(), 'AGENTS.md'))) {
                        fingerprint = await mat.getFingerprint();
                    }
                } catch (e) {}
                
                await mat.begin(data, { manifestFingerprint: fingerprint, criticalArtifacts: {} });
            }
            break;

        case PlanStreamEvent.OPERATION_READY:
            const op = data as StreamedExecutionOperation;
            if (op.planId === workflowId) {
                process.stderr.write(chalk.gray(`  [${op.sequence}] Applying ${op.type}: ${op.path}...\r`));
                await mat.applyOperation(op);
            }
            break;

        case PlanStreamEvent.COMMITTED:
            if (data.planId === workflowId) {
                console.error(chalk.green(`\n🏁 Materialization Complete!`));
                await mat.commit();
                process.exit(0);
            }
            break;

        case PlanStreamEvent.ABORTED:
            if (data.planId === workflowId) {
                console.error(chalk.red(`\n🛑 Stream Aborted: ${data.reason}`));
                await mat.abort(data.reason);
                process.exit(1);
            }
            break;
    }
}
