import * as path from 'path';
import chalk = require('chalk');
import { loadSpec } from '../core/vfs/io';
import { DesignSpec } from '../core/state/spec';
import { executeOrchestrator } from '../core/engine/orchestrator-api';
import { PlanReporter } from '../core/telemetry/plan-reporter';
import { syncRemoteState } from '../core/sync/remote-sync';

export async function planCommand(options: { spec: string, out?: string }) {
    const specPath = path.resolve(process.cwd(), options.spec);
    const outDir = path.resolve(process.cwd(), options.out || 'archon-output');

    try {
        const spec = await loadSpec(specPath) as DesignSpec;
        console.error(chalk.blue(`Loaded spec: ${spec.name} for planning`));

        const result = await executeOrchestrator(
            spec, 
            outDir, 
            'plan'
        );

        const reporter = new PlanReporter();
        reporter.print(result.results);
        
        console.error(chalk.gray(`\nDry-run complete. Run 'archon generate' to apply.`));
        console.error(chalk.gray(`Trace ID: ${result.traceId}`));

        await syncRemoteState('PLAN_CREATED');

    } catch (err: any) {
        console.error(chalk.red(`Error during plan mode: ${err.message}`));
        process.exit(1);
    }
}
