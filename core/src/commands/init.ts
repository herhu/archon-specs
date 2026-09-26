import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { materializeCommand } from './materialize';

export async function initCommand(name: string, options: { remote?: string, workflowId?: string, apiKey?: string }) {
    const targetDir = path.resolve(process.cwd(), name);

    if (fs.existsSync(targetDir) && name !== '.') {
        console.error(chalk.red(`Directory ${name} already exists.`));
        process.exit(1);
    }

    await fs.ensureDir(targetDir);
    
    // If name is '.', we are initializing in current directory
    const isCurrentDir = name === '.';
    console.error(chalk.green(`🚀 Initializing Archon workspace in ${targetDir}`));

    // 1. Setup .archon directory
    const archonDir = path.join(targetDir, '.archon');
    await fs.ensureDir(archonDir);

    // 2. Handle Remote Flow
    if (options.remote) {
        const apiKey = (options as any).apiKey || (options as any)['api-key'] || 'YOUR_API_KEY_HERE';
        const config = {
            url: options.remote.endsWith('/mcp/sse') ? options.remote : `${options.remote}/mcp/sse`,
            apiKey: apiKey
        };
        await fs.writeJSON(path.join(archonDir, 'config.json'), config, { spaces: 2 });
        console.error(chalk.blue(`📝 Configured remote: ${config.url}`));

        if (options.workflowId) {
            console.error(chalk.yellow(`🔗 Linking to workflow: ${options.workflowId}`));
            // We need to change CWD to the target directory for materialization
            if (!isCurrentDir) process.chdir(targetDir);
            await materializeCommand(options.workflowId);
            return;
        }
    }

    // 3. Local Fallback / Default State
    const defaultSpec = {
        name: isCurrentDir ? path.basename(targetDir) : name,
        domains: [],
        crossCutting: {
            auth: {
                jwt: {
                    issuer: 'https://issuer.example.com',
                    audience: 'api',
                    jwksUri: 'https://issuer.example.com/.well-known/jwks.json'
                }
            }
        }
    };

    await fs.writeJSON(path.join(targetDir, 'designspec.json'), defaultSpec, { spaces: 2 });
    console.error(chalk.blue(`Created designspec.json`));
}
