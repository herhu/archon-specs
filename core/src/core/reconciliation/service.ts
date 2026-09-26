import { DesignSpec } from '../state/spec';
import { EntityProber } from './prober';
import { DiffEngine, DriftRecord } from './diff-engine';
import { RepairGenerator, RepairProposal } from './repair-generator';
import { TelemetryEmitter } from '../telemetry/telemetry';
import { EventType, EventCategory } from '../telemetry/telemetry-schema';
import { TraceManager } from '../telemetry/trace-context';

export interface ReconciliationReport {
    traceId: string;
    timestamp: string;
    drifts: DriftRecord[];
    proposals: RepairProposal[];
    isCompliant: boolean;
}

/**
 * StructuralReconciler: The "Governor" that enforces architectural alignment.
 */
export class StructuralReconciler {
    static async reconcile(spec: DesignSpec, outDir: string, externalTraceId?: string): Promise<ReconciliationReport> {
        const traceId = externalTraceId || `rec-${Math.random().toString(36).substring(2, 10)}`;
        
        TelemetryEmitter.emit({
            event: 'RECONCILIATION_STARTED',
            eventType: EventType.ORCHESTRATION_STARTED,
            eventCategory: EventCategory.GOVERNANCE,
            metadata: { traceId, projectName: spec.name }
        });

        const prober = new EntityProber(outDir);
        const reality = await prober.probe();
        
        const diffEngine = new DiffEngine();
        const drifts = diffEngine.compare(spec, reality);
        const proposals = RepairGenerator.generateProposals(drifts);

        const isCompliant = drifts.length === 0;

        // Log each drift as a telemetry event
        drifts.forEach(drift => {
            TelemetryEmitter.emit({
                event: 'DRIFT_DETECTED',
                eventType: EventType.DRIFT_DETECTED,
                eventCategory: EventCategory.GOVERNANCE,
                metadata: { ...drift, traceId }
            });
        });

        TelemetryEmitter.emit({
            event: 'RECONCILIATION_COMPLETED',
            eventType: EventType.ORCHESTRATION_COMPLETED,
            eventCategory: EventCategory.GOVERNANCE,
            metadata: { traceId, driftCount: drifts.length, isCompliant }
        });

        return {
            traceId,
            timestamp: new Date().toISOString(),
            drifts,
            proposals,
            isCompliant
        };
    }
}
