import * as path from 'path';
import * as fs from 'fs-extra';
import chalk = require('chalk');
import { executeOrchestrator } from '../core/engine/orchestrator-api';
import { loadSpec } from '../core/vfs/io';
import { DesignSpec } from '../core/state/spec';
import { normalizeSpec } from '../core/state/normalize';
import { verifyLineage } from '../core/engine/generator'; // We might leave lineage verification intact or adapt it later
import { validateSpecSchema, validateSpecSemantic } from '../core/validators/validator';
import { syncRemoteState } from '../core/sync/remote-sync';

import { createExecutionContext } from '../core/engine/execution-context';
import { VirtualTree } from '../core/vfs/vfs';
import { templateEngine } from '../core/vfs/template-engine';
import { AstEditor } from '../core/vfs/ast-editor';
import { DefaultRuleBuilder } from '../builders/default-rule-builder';
import { RuleRunner } from '../core/engine/rule-runner';
import { PlanReporter } from '../core/telemetry/plan-reporter';
import { TypescriptParseValidator } from '../core/validators/typescript-parse.validator';
import { JsonParseValidator } from '../core/validators/json-parse.validator';

export async function generateCommand(options: any) {
    try {
        const specPath = path.resolve(process.cwd(), options.spec);
        const outDir = path.resolve(process.cwd(), options.out || 'archon-output');
        const rawSpec = await loadSpec(specPath) as DesignSpec;
        const spec = normalizeSpec(rawSpec);
        
        // Check for trace ID in options OR environment
        const traceId = options.traceId || process.env.ARCHON_TRACE_ID;

        // Validation
        const schemaErrors = validateSpecSchema(spec);
        if (schemaErrors.length > 0) {
            console.error(chalk.red('Schema Validation Failed:'));
            schemaErrors.forEach(e => console.error(chalk.red(`- ${e}`)));
            process.exit(1);
        }

        const semanticErrors = validateSpecSemantic(spec);
        if (semanticErrors.length > 0) {
            console.error(chalk.red('Semantic Validation Failed:'));
            semanticErrors.forEach(e => console.error(chalk.red(`- ${e}`)));
            process.exit(1);
        }

        console.error(chalk.green(`Loaded spec: ${spec.name}`));

        // V2 Orchestration
        const result = await executeOrchestrator(
            spec, 
            outDir, 
            options.dryRun ? 'plan' : 'apply',
            undefined,
            !!options.force,
            traceId
        );

        console.error(chalk.green(`\n🚀 Orchestration Materialized Successfully!`));
        console.error(chalk.gray(`Trace ID: ${traceId || result.traceId}`));
        console.error(chalk.gray(`Output: ${outDir}`));

        // Post-orchestration validation or artifacts (optional)
        if (options.json) {
            process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        }

        if (options.qa !== false && !options.dryRun) {
            console.error(chalk.blue(`Running QA Gate...`));
            try {
                const cp = require('child_process');
                cp.execSync('npm install', { cwd: outDir, stdio: 'inherit' });
                cp.execSync('npm run build', { cwd: outDir, stdio: 'inherit' });
                console.error(chalk.green(`QA Gate Passed!`));
            } catch (e) {
                console.error(chalk.red(`QA Gate Failed!`));
                // Don't exit, we already materialized.
            }
        }

        if (!options.dryRun) {
            await syncRemoteState('GENERATED');
        }

        console.error(chalk.green('Generation complete!'));
    } catch (err: any) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
    }
}

export async function verifyCommand(options: { spec: string, out?: string }) {
    // Legacy verify maintained
    const specPath = path.resolve(process.cwd(), options.spec);
    const outDir = path.resolve(process.cwd(), options.out || 'archon-output');

    try {
        const spec = await loadSpec(specPath) as DesignSpec;

        let templatesDir = path.join(__dirname, "../templates.js");
        if (!fs.existsSync(templatesDir)) {
            templatesDir = path.join(__dirname, "../../src/templates.js");
        }

        const audit = await verifyLineage(spec, outDir, templatesDir);
        if (audit.valid) {
            console.error(chalk.green(`✓ Lineage verified. Binding [spec -> template -> system] holds.`));
        } else {
            console.error(chalk.red(`✗ Lineage mismatch detected!`));
            audit.errors.forEach(e => console.error(chalk.red(`- ${e}`)));
            process.exit(1);
        }
    } catch (err: any) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
    }
}
