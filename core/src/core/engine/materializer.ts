import { VirtualTree } from '../vfs/vfs';
import { StateManager, ArchonState, AppliedPlanRecord } from '../state/state-manager';
import { ExecutionPlan } from './execution-plan';
import { DriftDetector } from '../governance/drift-detector';
import { RepoObserver } from '../governance/repo-observer';
import { ReconciliationPolicy } from '../governance/reconciliation-policy';
import { logger } from '../telemetry/logger';
import * as path from 'path';
import { TelemetryEmitter } from '../telemetry/telemetry';
import { EventType } from '../telemetry/telemetry-schema';

export interface MaterializationResult {
    success: boolean;
    error?: string;
    decision: string;
    appliedCount: number;
    planId: string;
    status: string;
}

/**
 * PlanMaterializer: The local safety gate for applying remote ExecutionPlans.
 * Implements the authoritative "Contract Gate" for distributed code control.
 */
export class PlanMaterializer {
    constructor(private readonly outDir: string, private readonly externalTraceId?: string) {}

    async apply(plan: ExecutionPlan): Promise<MaterializationResult> {
        const vfs = new VirtualTree(this.outDir);
        const stateManager = new StateManager(this.outDir);
        const currentState = await stateManager.load();
        
        // Init Telemetry
        TelemetryEmitter.setWorkspace(this.outDir);
        const traceId = this.externalTraceId || plan.metadata.traceId;
        
        if (traceId) {
            TelemetryEmitter.setGlobalContext({
                traceId: traceId,
                workspaceId: this.outDir,
                actorId: 'archon-materializer'
            });
        }

        TelemetryEmitter.emit({
            event: 'MATERIALIZATION_STARTED',
            eventType: 'MATERIALIZATION_STARTED',
            eventCategory: 'materializer',
            operation: 'apply_plan',
            planId: plan.metadata.planId,
            metadata: { operationCount: plan.operations.length }
        });

        // Replay Protection
        if (currentState.appliedPlans.some(p => p.planId === plan.metadata.planId)) {
             return this.reject(plan, currentState, stateManager, "REPLAY_DETECTED: This plan has already been applied to this workspace.");
        }

        // Schema Version Policy
        const currentMajor = "1"; 
        const planMajor = plan.metadata.planSchemaVersion.split('.')[0];
        if (planMajor !== currentMajor) {
            return this.reject(plan, currentState, stateManager, `SCHEMA_MISMATCH: Unsupported plan schema version ${plan.metadata.planSchemaVersion}. Local engine supports major version ${currentMajor}.`);
        }

        for (const op of plan.operations) {
            if (op.content) {
                const actualHash = StateManager.calculateHash(op.content);
                if (actualHash !== op.fingerprint) {
                    return this.fail(plan, currentState, stateManager, `INTEGRITY_FAILURE: Operation content hash mismatch for ${op.path}. Possible payload tampering or corruption.`);
                }
            }
            const normalizedPath = path.normalize(op.path);
            if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
                return this.reject(plan, currentState, stateManager, `SECURITY_VIOLATION: Operation path '${op.path}' attempts to escape the project root.`);
            }
        }

        const currentManifestFingerprint = StateManager.calculateFingerprint(currentState);
        if (plan.baseState.manifestFingerprint !== currentManifestFingerprint) {
            logger.error({ 
                planExpected: plan.baseState.manifestFingerprint, 
                localActual: currentManifestFingerprint 
            }, "Base-State Compatibility Check Failed. The plan is STALE.");
            return this.reject(plan, currentState, stateManager, "STALE_PLAN: The local state has changed since this plan was generated. Please re-run the remote plan.");
        }

        const observer = new RepoObserver(vfs);
        const observedState = await observer.observe(currentState);
        const detector = new DriftDetector();
        const driftRecords = detector.detect(currentState, observedState);
        const policy = new ReconciliationPolicy();
        const assessment = policy.evaluate(driftRecords);

        if (assessment.action === 'Block') {
             TelemetryEmitter.emit({
                event: 'IMMUNE_SYSTEM_TRIGGERED',
                eventType: EventType.IMMUNE_SYSTEM_TRIGGERED,
                metadata: { 
                    reason: `Drift Block: ${assessment.reason}`,
                    planId: plan.metadata.planId
                }
             });
             return this.reject(plan, currentState, stateManager, `DRIFT_BLOCK: Local architectural drift prevents plan application: ${assessment.reason}`);
        }

        try {
            await vfs.applyPlan(plan);
            // @ts-ignore
            await vfs.validateChanges();
        } catch (err: any) {
             return this.fail(plan, currentState, stateManager, `STAGING_VALIDATION_ERROR: ${err.message}`);
        }

        try {
            await vfs.commit();
            
            const record: AppliedPlanRecord = {
                planId: plan.metadata.planId,
                traceId: traceId || 'unknown',
                appliedAt: new Date().toISOString(),
                planSchemaVersion: plan.metadata.planSchemaVersion,
                engineVersion: plan.metadata.engineVersion,
                fingerprint: plan.targetStateFingerprint
            };

            const auditEntry = {
                planId: plan.metadata.planId,
                traceId: traceId || 'unknown',
                timestamp: record.appliedAt,
                status: 'APPLIED' as const,
                riskLevel: plan.metadata.riskLevel || 'LOW',
                summary: plan.metadata.summary
            };

            const finalState: ArchonState = {
                ...currentState,
                lastAppliedAt: record.appliedAt,
                appliedPlans: [record, ...currentState.appliedPlans].slice(0, 50),
                planHistory: [auditEntry, ...(currentState.planHistory || [])].slice(0, 100)
            };
            
            await stateManager.save(finalState);
            await stateManager.archivePlan(plan);

            TelemetryEmitter.logPlanApplied(plan.metadata.planId, plan.metadata.riskLevel || 'LOW');
            TelemetryEmitter.emit({
                event: 'MATERIALIZATION_COMPLETED',
                eventType: 'MATERIALIZATION_COMPLETED',
                eventCategory: 'materializer',
                operation: 'apply_plan',
                planId: plan.metadata.planId,
                status: 'SUCCESS'
            });

            return {
                success: true,
                decision: 'Apply',
                appliedCount: plan.operations.length,
                planId: plan.metadata.planId,
                status: 'APPLIED'
            };
        } catch (err: any) {
            return this.fail(plan, currentState, stateManager, `COMMIT_ERROR: Failed to write to disk: ${err.message}`);
        }
    }

    private async reject(plan: ExecutionPlan, state: ArchonState, stateManager: StateManager, reason: string): Promise<MaterializationResult> {
        logger.warn({ planId: plan.metadata.planId, reason }, "Plan REJECTED by Local Authority");
        
        const finalState: ArchonState = {
            ...state,
            planHistory: [{
                planId: plan.metadata.planId,
                traceId: this.externalTraceId || plan.metadata.traceId || 'unknown',
                timestamp: new Date().toISOString(),
                status: 'REJECTED' as const,
                reason,
                riskLevel: plan.metadata.riskLevel || 'LOW',
                summary: plan.metadata.summary
            }, ...(state.planHistory || [])].slice(0, 100)
        };
        await stateManager.save(finalState);
        
        TelemetryEmitter.logPlanRejected(plan.metadata.planId, reason);
        TelemetryEmitter.emit({
            event: 'MATERIALIZATION_REJECTED',
            eventType: 'MATERIALIZATION_REJECTED',
            eventCategory: 'materializer',
            operation: 'apply_plan',
            planId: plan.metadata.planId,
            status: 'REJECTED',
            reason
        });

        return {
            success: false,
            error: reason,
            decision: 'Block',
            appliedCount: 0,
            planId: plan.metadata.planId,
            status: 'REJECTED'
        };
    }

    private async fail(plan: ExecutionPlan, state: ArchonState, stateManager: StateManager, reason: string): Promise<MaterializationResult> {
        logger.error({ planId: plan.metadata.planId, reason }, "Plan application FAILED");
        
        const finalState: ArchonState = {
            ...state,
            planHistory: [{
                planId: plan.metadata.planId,
                traceId: this.externalTraceId || plan.metadata.traceId || 'unknown',
                timestamp: new Date().toISOString(),
                status: 'FAILED' as const,
                reason,
                riskLevel: plan.metadata.riskLevel || 'LOW',
                summary: plan.metadata.summary
            }, ...(state.planHistory || [])].slice(0, 100)
        };
        await stateManager.save(finalState);

        TelemetryEmitter.logPlanFailed(plan.metadata.planId, reason);
        TelemetryEmitter.emit({
            event: 'MATERIALIZATION_FAILED',
            eventType: 'MATERIALIZATION_FAILED',
            eventCategory: 'materializer',
            operation: 'apply_plan',
            planId: plan.metadata.planId,
            status: 'FAILED',
            reason
        });

        return {
            success: false,
            error: reason,
            decision: 'Abort',
            appliedCount: 0,
            planId: plan.metadata.planId,
            status: 'FAILED'
        };
    }
}
