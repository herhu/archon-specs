import * as path from 'path';
import * as fs from 'fs-extra';
import { DesignSpec } from '../state/spec';
import { normalizeSpec } from '../state/normalize';
import { createExecutionContext } from './execution-context';
import { VirtualTree } from '../vfs/vfs';
import { templateEngine } from '../vfs/template-engine';
import { AstEditor } from '../vfs/ast-editor';
import { DefaultRuleBuilder } from '../../builders/default-rule-builder';
import { RuleRunner } from './rule-runner';
import { TypescriptParseValidator } from '../validators/typescript-parse.validator';
import { JsonParseValidator } from '../validators/json-parse.validator';
import { RuleResult } from '../../rules/rule-result';
import { StateManager, ArchonState, ARCHON_ENGINE_VERSION } from '../state/state-manager';
import { Executor } from './executor';
import { RepoObserver } from '../governance/repo-observer';
import { DriftDetector } from '../governance/drift-detector';
import { ReconciliationPolicy, ReconciliationDecision, ReconciliationAction } from '../governance/reconciliation-policy';
import { DriftRecord } from '../governance/drift-detector';
import { ExecutionPlan } from './execution-plan';
import { EventType, EventCategory } from '../telemetry/telemetry-schema';
import { OutcomeVerifier } from '../governance/outcome-verifier';
import { ExecutionController, MissionStatus } from './execution-controller';
import { SpecDeltaEngine } from '../state/spec-delta';

export interface ReconciliationAssessment {
    decision: ReconciliationAction;
    driftRecords: DriftRecord[];
    allowedActions: string[];
    summary: string;
}

export interface OrchestrationResult {
    results: RuleResult[];
    validationErrors: string[];
    state?: ArchonState;
    assessment: ReconciliationAssessment;
    executionPlan?: ExecutionPlan;
    traceId: string;
    outcome?: {
        success: boolean;
        reason?: string;
    };
}

import { RiskClassifier } from '../governance/risk-classifier';
import { TelemetryEmitter } from '../telemetry/telemetry';
import { TraceManager } from '../telemetry/trace-context';

/**
 * executeOrchestrator: The Unified Entry Point for Archon CLA.
 * Now includes Outcome Verification to close the Intelligence Loop.
 */
export async function executeOrchestrator(
    spec: DesignSpec, 
    outDir: string, 
    mode: 'plan' | 'apply', 
    capsuleIds?: string[],
    force: boolean = false,
    externalTraceId?: string,
    onOperationReady?: (op: any) => void
): Promise<OrchestrationResult> {
    const vfs = new VirtualTree(outDir);
    if (onOperationReady) {
        vfs.setOperationCallback(onOperationReady);
    }
    const stateManager = new StateManager(outDir);
    const initialState = await stateManager.load();
    
    // --- EXECUTION CONTROLLER GATE ---
    ExecutionController.guard(spec);
    const traceId = externalTraceId || TraceManager.createRoot().traceId;
    await ExecutionController.transition(traceId, MissionStatus.VALIDATED, spec.name);
    
    const trace = TraceManager.resume(traceId);
    const normalizedSpec = normalizeSpec(spec);

    TelemetryEmitter.setGlobalContext({
        traceId: trace.traceId,
        workspaceId: outDir,
        projectName: normalizedSpec.name,
        actorId: 'archon-cli'
    });

    TelemetryEmitter.logOrchestrationStarted(trace.traceId);

    if (mode === 'plan') {
        await ExecutionController.transition(traceId, MissionStatus.PLAN_GENERATED, normalizedSpec.name);
    }

    // --- RECONCILIATION GATE ---
    const observer = new RepoObserver(vfs);
    const observedState = await observer.observe(initialState);
    const detector = new DriftDetector();
    const driftRecords = detector.detect(initialState, observedState);
    const policy = new ReconciliationPolicy();
    const assessmentDetails = policy.evaluate(driftRecords);

    if (driftRecords.length > 0) {
        TelemetryEmitter.logDriftDetected(driftRecords.length);
    }

    const assessment: ReconciliationAssessment = {
        decision: assessmentDetails.action,
        driftRecords,
        allowedActions: assessmentDetails.action === 'Block' ? ['report'] : ['report', 'apply', 'force_align'],
        summary: assessmentDetails.reason
    };

    if (mode === 'apply' && assessment.decision === 'Block' && !force) {
        TelemetryEmitter.emit({
            event: 'IMMUNE_SYSTEM_TRIGGERED',
            eventType: EventType.IMMUNE_SYSTEM_TRIGGERED,
            metadata: { reason: assessment.summary, driftCount: driftRecords.length, blockingPolicy: true }
        });
        TelemetryEmitter.logOrchestrationCompleted(trace.traceId, 'FAILED');
        return {
            results: [],
            validationErrors: [`Orchestration blocked due to architectural drift: ${assessment.summary}`],
            state: initialState,
            assessment,
            traceId: trace.traceId
        };
    }

    if (mode === 'apply') {
        await ExecutionController.transition(traceId, MissionStatus.MATERIALIZING, normalizedSpec.name);
    }

    const astEditor = new AstEditor(vfs);
    const ctx = createExecutionContext(normalizedSpec, vfs, templateEngine, astEditor, mode, trace, force, initialState);
    
    // --- 🧬 INCREMENTAL EVOLUTION GATE ---
    const delta = SpecDeltaEngine.compute(initialState.spec, normalizedSpec);
    let targetCapsuleIds = capsuleIds; // Manual override if provided
    
    if (!targetCapsuleIds && !delta.isFullRegeneration) {
        targetCapsuleIds = delta.impactedCapsuleIds;
        ctx.logger.info(`🧬 Incremental Evolution: Targeting ${targetCapsuleIds.length} impacted capsules (${delta.reason})`);
    } else if (delta.isFullRegeneration) {
        ctx.logger.info(`🧬 Full Regeneration Required: ${delta.reason}`);
    }

    const builder = new DefaultRuleBuilder();
    const rules = builder.build(normalizedSpec, outDir);
    const runner = new RuleRunner(rules);
    const results = await runner.run(ctx, targetCapsuleIds);

    const tsVal = new TypescriptParseValidator();
    const tsResult = await tsVal.validate(vfs);
    const jsonVal = new JsonParseValidator();
    const jsonResult = await jsonVal.validate(vfs);

    const validationErrors = [...tsResult.errors, ...jsonResult.errors];
    let finalState = initialState;

    const operations = vfs.serializeOperations(results as RuleResult[]);

    if (mode === 'apply' && validationErrors.length === 0) {
        const executor = new Executor(vfs);
        const snapshot = await executor.captureSnapshot([], results as any); 
        await vfs.commit();
        
        finalState = {
            ...initialState,
            lastAppliedAt: snapshot.lastAppliedAt || initialState.lastAppliedAt,
            ownedArtifacts: { ...initialState.ownedArtifacts, ...snapshot.ownedArtifacts },
            spec: normalizedSpec
        };
        await stateManager.save(finalState);
    }

    const metrics = {
        operations: operations.length,
        affectedPaths: new Set(operations.map(op => op.path)).size,
        sizeBytes: operations.reduce((acc, op) => acc + (op.content?.length || 0), 0)
    };

    const operationStats = operations.reduce((acc: any, op) => {
        acc[op.type] = (acc[op.type] || 0) + 1;
        return acc;
    }, {});
    const summary = `🛡️ Mission: ${operations.length} operations (${operationStats.create || 0} create, ${operationStats.update || 0} update, ${operationStats.delete || 0} delete) across ${metrics.affectedPaths} files.`;

    const risk = RiskClassifier.classify(operations);

    const executionPlan: ExecutionPlan = {
        metadata: {
            planId: `plan_${Math.random().toString(36).substring(2, 10)}`,
            traceId: trace.traceId,
            engineVersion: ARCHON_ENGINE_VERSION,
            planSchemaVersion: "1.1.0",
            generatedAt: new Date().toISOString(),
            sourceMode: mode,
            status: "CREATED",
            metrics,
            summary,
            riskLevel: risk.level,
            requiresApproval: risk.requiresApproval,
            projectName: normalizedSpec.name
        },

        baseState: {
            manifestFingerprint: StateManager.calculateFingerprint(initialState),
            criticalArtifacts: {} 
        },
        operations,
        targetStateFingerprint: await vfs.calculateFingerprint()
    };

    // --- OUTCOME VERIFICATION (The Loop Closure) ---
    let outcome;
    if (mode === 'apply' && validationErrors.length === 0) {
        const verifier = new OutcomeVerifier(outDir);
        outcome = await verifier.verify(normalizedSpec, executionPlan);
    }

    const projectName = normalizedSpec.name;
    const centralPlansDir = path.join(process.cwd(), '.archon', 'projects', projectName, 'plans');
    await fs.ensureDir(centralPlansDir);
    await fs.writeJson(path.join(centralPlansDir, `${executionPlan.metadata.planId}.json`), executionPlan, { spaces: 2 });


    if (mode === 'apply') {
        await ExecutionController.transition(traceId, MissionStatus.MATERIALIZED, normalizedSpec.name);
    }

    TelemetryEmitter.logPlanGenerated(executionPlan.metadata.planId, risk.level, metrics);
    TelemetryEmitter.logOrchestrationCompleted(trace.traceId, 'SUCCESS');

    return {
        results,
        validationErrors,
        state: finalState,
        assessment,
        executionPlan,
        traceId: trace.traceId,
        outcome
    };
}

export async function reconcileState(
    spec: DesignSpec, 
    outDir: string, 
    mode: 'report' | 'safe_reconcile' | 'force_align'
): Promise<OrchestrationResult> {
    if (!spec) throw new Error("Cannot reconcile without a DesignSpec.");
    const plan = await executeOrchestrator(spec, outDir, 'plan');
    if (mode === 'report') return plan;
    if (mode === 'force_align') return await executeOrchestrator(spec, outDir, 'apply', undefined, true);
    if (mode === 'safe_reconcile') {
        if (plan.assessment.decision === 'Block' || plan.assessment.decision === 'ReconcileRequired') {
            return { ...plan, results: [] };
        }
        return await executeOrchestrator(spec, outDir, 'apply');
    }
    return plan;
}
