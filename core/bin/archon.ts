#!/usr/bin/env ts-node

import { Command } from 'commander';
import { generateCommand } from '../src/commands/generate';
import { initCommand } from '../src/commands/init';
import { planCommand } from '../src/commands/plan';
import { materializeCommand } from '../src/commands/materialize';
import { applyCommand } from '../src/commands/apply';

const program = new Command();

console.error('[TRACE:ARCHON:archon] System Architect CLI started...');

program
    .name('archon')
    .description('System Architect CLI - Governed Enterprise Platform Orchestration')
    .version('1.2.0');

program
    .command('init')
    .description('Initialize a new Archon project or connect to a remote workspace')
    .argument('[name]', 'Project name (defaults to current directory)', '.')
    .option('-r, --remote <url>', 'Remote Gateway URL (e.g. https://archon.api.com)')
    .option('-w, --workflow-id <id>', 'Active Workflow ID to materialize')
    .option('-k, --api-key <key>', 'API Key for remote authentication')
    .option('--apiKey <key>', 'Alias for --api-key')
    .action(initCommand);

program
    .command('materialize')
    .description('Materialize a remote workflow onto the local filesystem via SSE stream')
    .argument('<workflowId>', 'The ID of the workflow to materialize')
    .action(materializeCommand);

program
    .command('apply')
    .description('Pull and apply a completed materialization from the remote server using a key')
    .argument('[identity]', 'Project ID or Workflow ID')
    .option('-k, --key <key>', 'Materialization key')
    .action(applyCommand);

program
    .command('generate')
    .description('Generate code from designspec.json')
    .option('-s, --spec <path>', 'Path to designspec.json', 'designspec.json')
    .option('-p, --prev-spec <path>', 'Path to previous designspec.json for incremental generation')
    .option('-o, --out <path>', 'Output directory', 'archon-output')
    .option('-f, --force', 'Overwrite existing files', false)
    .option('--diff', 'Preview changes without applying', false)
    .option('--json', 'Output results in JSON format', false)
    .option('--no-qa', 'Skip QA checks')
    .option('--trace-id <id>', 'Client-provided trace ID for observability')
    .option('-d, --dry-run', 'Run without writing files')
    .action(generateCommand);

program
    .command('plan')
    .description('Preview orchestration changes based on designspec.json without writing to disk')
    .option('-s, --spec <path>', 'Path to designspec.json', 'designspec.json')
    .option('-o, --out <path>', 'Output directory', 'archon-output')
    .action(planCommand);

program
    .command('verify')
    .description('Verify code lineage against designspec.json')
    .option('-s, --spec <path>', 'Path to designspec.json', 'designspec.json')
    .option('-o, --out <path>', 'Output directory', 'archon-output')
    .action(async (options) => {
        const { verifyCommand } = require('../src/commands/generate');
        await verifyCommand(options);
    });

program.parse();
