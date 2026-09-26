import { RuleResult } from '../../rules/rule-result';
import { ChangeOperation, ExecutionResult } from '../engine/change-operation';
import { DriftRecord } from '../governance/drift-detector';
import { ReconciliationDecision } from '../governance/reconciliation-policy';
import chalk = require('chalk');

export class PlanReporter {
  print(results: RuleResult[]): void {
    console.error(chalk.blue('--- Archon Plan (Legacy) ---'));
    let hasChanges = false;

    for (const result of results) {
      if (result.status === 'failed') {
        console.error(chalk.red(`[FAIL] ${result.ruleId}: ${result.error}`));
        continue;
      }
      
      if (result.status === 'no-op') continue;

      hasChanges = true;
      console.error(chalk.cyan(`[OK] ${result.ruleId}`));
      
      for (const change of result.changes) {
        if (change.type === 'create') {
          console.error(chalk.green(`  + CREATE ${change.path}`));
        } else if (change.type === 'update') {
          console.error(chalk.yellow(`  ~ UPDATE ${change.path}`));
        } else if (change.type === 'delete') {
          console.error(chalk.red(`  x DELETE ${change.path}`));
        }
      }
    }

    if (!hasChanges) {
      console.error(chalk.green('No changes needed. Target state matches desired architecture.'));
    }

    console.error(chalk.blue('-----------------------------'));
  }

  reportDrift(records: DriftRecord[], decision: ReconciliationDecision) {
    if (records.length === 0) return;

    console.error("\n⚠️  DRIFT DETECTION SUMMARY");
    console.error("--------------------------");
    for (const record of records) {
        const severityIcon = record.severity === 'block' ? chalk.red('🚫') : (record.severity === 'warn' ? chalk.yellow('🟡') : chalk.blue('ℹ️'));
        console.error(`${severityIcon} [${record.driftType}] ${record.message} (Capsule: ${record.capsuleId})`);
    }
    console.error("--------------------------");
    const decisionIcon = decision.action === 'Block' ? chalk.red('🛑') : chalk.green('✅');
    console.error(`${decisionIcon} RECONCILIATION DECISION: ${decision.action.toUpperCase()}`);
    console.error(`Reason: ${decision.reason}\n`);
  }

  reportOperations(operations: ChangeOperation[], results?: ExecutionResult[]): void {
    console.error(chalk.bold.blue('\n🏁 Archon Execution Plan (CLA)'));
    
    const capsules = [...new Set(operations.map(op => op.capsuleId))];

    for (const capsuleId of capsules) {
        console.error(chalk.magenta.bold(`\n📦 Capsule: ${capsuleId}`));
        const capOps = operations.filter(op => op.capsuleId === capsuleId);

        for (const op of capOps) {
            const result = results?.find(r => r.operationId === op.id);
            let icon = '  ~';
            let color = chalk.yellow;
            let status = '';

            if (op.kind === 'create-file') { icon = '  +'; color = chalk.green; }
            if (op.kind === 'delete-file') { icon = '  x'; color = chalk.red; }
            if (op.kind === 'update-slot') { icon = '  ⦿'; color = chalk.cyan; }

            if (result) {
                if (!result.success) {
                    status = chalk.red(` [FAILED: ${result.error}]`);
                } else if (result.warning === 'no-op' || result.warning?.includes('exists') || result.warning?.includes('registered')) {
                    status = chalk.gray(` [NO-OP: ${result.warning}]`);
                    color = chalk.gray;
                } else {
                    status = chalk.green(' [APPLIED]');
                }
            }

            console.error(color(`${icon} [${op.kind}] ${op.target}${status}`));
        }
    }

    console.error(chalk.bold.blue('\n-------------------------------'));
  }
}
