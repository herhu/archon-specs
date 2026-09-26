import { ArchonRule, RulePhase } from '../../rules/archon-rule';
import { RuleResult } from '../../rules/rule-result';
import { ExecutionContext } from './execution-context';
import { TraceManager } from '../telemetry/trace-context';
import { TelemetryEmitter } from '../telemetry/telemetry';

const PhaseOrder: Record<RulePhase, number> = {
  scaffold: 1,
  merge: 2,
  validate: 3
};

function byPhaseThenLayerThenId(a: ArchonRule, b: ArchonRule): number {
  const phaseDiff = PhaseOrder[a.phase] - PhaseOrder[b.phase];
  if (phaseDiff !== 0) return phaseDiff;
  // Intentional topological layering within a phase (artifact lattice), instead
  // of an alphabetical accident. Lower layer first.
  const layerDiff = (a.layer ?? 0) - (b.layer ?? 0);
  if (layerDiff !== 0) return layerDiff;
  return (a.id || "").localeCompare(b.id || "");
}

export class RuleRunner {
  constructor(private readonly rules: ArchonRule[]) {}

  async run(ctx: ExecutionContext, impactedCapsuleIds?: string[]): Promise<RuleResult[]> {
    const ordered = this.rules
      .filter(rule => {
          if (impactedCapsuleIds && !impactedCapsuleIds.includes(rule.id)) return false;
          return rule.applies(ctx);
      })
      .sort(byPhaseThenLayerThenId);

    const results: RuleResult[] = [];

    for (const rule of ordered) {
      const ruleTrace = TraceManager.createChild(ctx.trace);
      const startTime = Date.now();

      TelemetryEmitter.emit({
        event: 'RULE_STARTED',
        eventType: 'RULE_STARTED',
        eventCategory: 'rules',
        traceId: ruleTrace.traceId,
        spanId: ruleTrace.spanId,
        parentSpanId: ruleTrace.parentSpanId,
        operation: `run_rule:${rule.id}`,
        metadata: { ruleId: rule.id, phase: rule.phase }
      });

      ctx.logger.info(`Running rule: ${rule.id} (${rule.description})`);
      
      try {
        const result = await rule.apply({ ...ctx, trace: ruleTrace });
        results.push(result);

        const durationMs = Date.now() - startTime;
        TelemetryEmitter.emit({
          event: 'RULE_COMPLETED',
          eventType: 'RULE_COMPLETED',
          eventCategory: 'rules',
          traceId: ruleTrace.traceId,
          spanId: ruleTrace.spanId,
          parentSpanId: ruleTrace.parentSpanId,
          status: result.status === 'failed' ? 'FAILED' : 'SUCCESS',
          severity: result.status === 'failed' ? 'ERROR' : 'INFO',
          durationMs,
          operation: `run_rule:${rule.id}`,
          metadata: { 
            ruleId: rule.id, 
            phase: rule.phase, 
            changes: result.changes.length,
            paths: result.changes.map(c => c.path)
          }
        });

        if (result.status === 'failed') {
          const errorMsg = `[${rule.id}] ${result.error ?? 'Rule failed'}`;
          ctx.logger.error(errorMsg);
          throw new Error(errorMsg);
        }
      } catch (err: any) {
        TelemetryEmitter.emit({
          event: 'RULE_FAILED',
          eventType: 'RULE_FAILED',
          eventCategory: 'rules',
          traceId: ruleTrace.traceId,
          spanId: ruleTrace.spanId,
          parentSpanId: ruleTrace.parentSpanId,
          status: 'FAILED',
          severity: 'ERROR',
          reason: err.message,
          operation: `run_rule:${rule.id}`,
          metadata: { ruleId: rule.id, phase: rule.phase }
        });
        throw err;
      }
    }

    return results;
  }
}
