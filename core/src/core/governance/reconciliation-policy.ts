import { DriftRecord } from './drift-detector';
import { logger } from '../telemetry/logger';

export type ReconciliationAction = 
    | "Continue"    // No drift or ignore drift
    | "Reconcile"   // Auto-restore desired state
    | "ForceAlign"  // Overwrite even if blocked
    | "Block"       // Stop orchestration due to unsafe drift
    | "ReconcileRequired" // VALID requested mutation, but current state is divergent.
    | "Warn";       // Continue but alert user

export interface ReconciliationDecision {
    action: ReconciliationAction;
    reason: string;
    affectedTargets: string[];
}

/**
 * ReconciliationPolicy decides how to respond to detected drift based on 
 * artifact ownership and architectural rules.
 */
export class ReconciliationPolicy {
    evaluate(records: DriftRecord[]): ReconciliationDecision {
        if (records.length === 0) {
            return { action: "Continue", reason: "No drift detected", affectedTargets: [] };
        }

        const blockingDrifts = records.filter(r => r.severity === 'block');
        const WarningDrifts = records.filter(r => r.severity === 'warn');

        if (blockingDrifts.length > 0) {
            return {
                action: "Block",
                reason: `Unsafe drift detected in ${blockingDrifts.length} managed artifacts. Manual review required.`,
                affectedTargets: blockingDrifts.map(r => r.target)
            };
        }

        if (WarningDrifts.length > 0) {
            return {
                action: "Warn",
                reason: `Recoverable drift detected in ${WarningDrifts.length} shared artifacts.`,
                affectedTargets: WarningDrifts.map(r => r.target)
            };
        }

        return {
            action: "Continue",
            reason: "Informational drift detected",
            affectedTargets: records.map(r => r.target)
        };
    }
}
