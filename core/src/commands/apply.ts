import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { PlanMaterializer } from '../core/engine/materializer';
import { ExecutionPlan } from '../core/engine/execution-plan';

export async function applyCommand(identity: string | undefined, options: { key: string }) {
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

    // If identity is not provided, use the key as the identity (the server handles this)
    const effectiveIdentity = identity || options.key;

    if (!effectiveIdentity) {
        console.error(chalk.red('Error: You must provide a project ID or a materialization --key.'));
        process.exit(1);
    }

    console.error(chalk.blue(`🚀 Pulling materialization for: ${effectiveIdentity}`));
    
    try {
        // 1. Fetch Materialization Data from Remote
        // We use the /mcp endpoint to call archon_get_materialization_data
        const mcpUrl = config.url.replace('/sse', '');
        
        const response = await fetch(mcpUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}` // Many Archon servers use this
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                    name: 'archon_get_materialization_data',
                    arguments: {
                        projectId: effectiveIdentity,
                        key: options.key
                    }
                },
                id: 1
            })
        });

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${await response.text()}`);
        }

        const result = await response.json();
        if (result.error) {
            throw new Error(result.error.message || JSON.stringify(result.error));
        }

        const matData = result.result?.structuredContent || result.result;
        if (!matData.planUrl) {
            throw new Error('Server did not return a planUrl. Ensure the generation was successful.');
        }

        // 2. Download the Execution Plan
        console.error(chalk.gray(`📥 Downloading Execution Plan...`));
        const planRes = await fetch(matData.planUrl);
        if (!planRes.ok) throw new Error(`Failed to download plan: ${planRes.statusText}`);
        
        const plan: ExecutionPlan = await planRes.json();
        console.error(chalk.green(`✅ Plan loaded: ${plan.metadata.summary}`));

        // 3. Apply the Plan locally
        const materializer = new PlanMaterializer(root);
        console.error(chalk.yellow(`🛠️ Applying operations to local filesystem...`));
        
        const matResult = await materializer.apply(plan);

        if (matResult.success) {
            console.error(chalk.green(`\n🏁 SUCCESS: Applied ${matResult.appliedCount} operations successfully.`));
            console.error(chalk.gray(`Plan ID: ${matResult.planId}`));
        } else {
            console.error(chalk.red(`\n❌ Materialization Failed: ${matResult.error}`));
            process.exit(1);
        }

    } catch (err: any) {
        console.error(chalk.red(`\n❌ Error: ${err.message}`));
        process.exit(1);
    }
}
