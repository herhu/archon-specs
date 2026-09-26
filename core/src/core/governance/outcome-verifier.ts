import { VirtualTree } from '../vfs/vfs';
import { RepoObserver } from './repo-observer';
import { DriftDetector } from './drift-detector';
import { StateManager } from '../state/state-manager';
import { DesignSpec } from '../state/spec';
import { ExecutionPlan } from '../engine/execution-plan';
import { TelemetryEmitter } from '../telemetry/telemetry';
import { EventCategory, EventType } from '../telemetry/telemetry-schema';
import { logger } from '../telemetry/logger';

export interface VerificationResult {
    success: boolean;
    reason?: string;
    driftCount: number;
    unmanagedArtifacts: string[];
}

/**
 * OutcomeVerifier: Closes the gap between "execution" and "architectural goal".
 * Runs a post-apply scan to ensure the workspace matches the DesignSpec.
 */
export class OutcomeVerifier {
    constructor(private readonly outDir: string) {}

    async verify(spec: DesignSpec, plan: ExecutionPlan): Promise<VerificationResult> {
        const vfs = new VirtualTree(this.outDir);
        const stateManager = new StateManager(this.outDir);
        const state = await stateManager.load();
        
        const observer = new RepoObserver(vfs);
        const observedState = await observer.observe(state);
        
        const detector = new DriftDetector();
        const drift = detector.detect(state, observedState);
        
        // 1. Check for Managed Drift: If any 'managed' artifact still has drift, the outcome failed.
        // We consider 'managed' and 'shared' as critical artifacts for verification.
        const managedDrift = drift.filter(r => r.ownership === 'managed' || r.ownership === 'shared');
        
        const traceId = plan.metadata.traceId;
        
        TelemetryEmitter.emit({
            traceId,
            event: 'OUTCOME_EVALUATED',
            eventType: EventType.OUTCOME_EVALUATED,
            eventCategory: EventCategory.INTELLIGENCE,
            metadata: { 
                planId: plan.metadata.planId,
                driftCount: drift.length,
                managedDriftCount: managedDrift.length
            }
        });

        if (managedDrift.length > 0) {
            const reason = `Architectural mismatch: ${managedDrift.length} critical artifacts are still divergent from the DesignSpec after plan application.`;
            
            TelemetryEmitter.emit({
                traceId,
                event: 'OUTCOME_FAILED',
                eventType: EventType.OUTCOME_FAILED,
                eventCategory: EventCategory.INTELLIGENCE,
                metadata: { reason, failedArtifacts: managedDrift.map(d => d.target) }
            });

            return {
                success: false,
                reason,
                driftCount: drift.length,
                unmanagedArtifacts: [] // DriftDetector doesn't track unmanaged yet
            };
        }

        // 2. Success Case
        TelemetryEmitter.emit({
            traceId,
            event: 'OUTCOME_SUCCESS',
            eventType: EventType.OUTCOME_SUCCESS,
            eventCategory: EventCategory.INTELLIGENCE,
            metadata: { planId: plan.metadata.planId }
        });

        return {
            success: true,
            driftCount: drift.length,
            unmanagedArtifacts: []
        };
    }
}
