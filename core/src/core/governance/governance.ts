import { TelemetryEmitter } from '../telemetry/telemetry';
import { EventType, EventCategory } from '../telemetry/telemetry-schema';

export enum WorkflowState {
    NEW = "NEW",
    WORKSPACE_INITIALIZED = "WORKSPACE_INITIALIZED",
    DISCOVERY_DONE = "DISCOVERY_DONE",
    ARCHITECTURE_CONTRACT_CREATED = "ARCHITECTURE_CONTRACT_CREATED",
    DESIGN_DRAFTED = "DESIGN_DRAFTED",
    SPEC_SHARDS_CREATED = "SPEC_SHARDS_CREATED",
    IR_PARSED = "IR_PARSED",
    SPEC_COMPILED = "SPEC_COMPILED",
    SPEC_CREATED = "SPEC_CREATED",
    SPEC_VALIDATED = "SPEC_VALIDATED",
    PLAN_CREATED = "PLAN_CREATED",
    USER_APPROVED = "USER_APPROVED",
    GENERATED = "GENERATED",
    VERIFIED = "VERIFIED",
    DELIVERED = "DELIVERED"
}

export const ARCHON_POLICY = {
    destructiveTools: [
        "archon_generate_project",
        "archon_apply_plan",
        "archon_reconcile"
    ],
    directCallDenylist: [
        "archon_materialization_begin",
        "archon_materialization_apply_op",
        "archon_materialization_commit",
        "archon_materialization_resume"
    ],
    allowedTransitions: {
        [WorkflowState.NEW]: [WorkflowState.WORKSPACE_INITIALIZED],
        [WorkflowState.WORKSPACE_INITIALIZED]: [WorkflowState.DISCOVERY_DONE, WorkflowState.DESIGN_DRAFTED, WorkflowState.ARCHITECTURE_CONTRACT_CREATED],
        [WorkflowState.DISCOVERY_DONE]: [WorkflowState.DESIGN_DRAFTED, WorkflowState.ARCHITECTURE_CONTRACT_CREATED],
        [WorkflowState.DESIGN_DRAFTED]: [WorkflowState.IR_PARSED, WorkflowState.SPEC_CREATED, WorkflowState.ARCHITECTURE_CONTRACT_CREATED],
        [WorkflowState.ARCHITECTURE_CONTRACT_CREATED]: [WorkflowState.SPEC_SHARDS_CREATED],
        [WorkflowState.IR_PARSED]: [WorkflowState.SPEC_CREATED, WorkflowState.SPEC_SHARDS_CREATED],
        [WorkflowState.SPEC_SHARDS_CREATED]: [WorkflowState.SPEC_COMPILED],
        [WorkflowState.SPEC_COMPILED]: [WorkflowState.SPEC_VALIDATED, WorkflowState.PLAN_CREATED],
        [WorkflowState.SPEC_CREATED]: [WorkflowState.SPEC_VALIDATED, WorkflowState.PLAN_CREATED, WorkflowState.DESIGN_DRAFTED, WorkflowState.SPEC_COMPILED],
        [WorkflowState.SPEC_VALIDATED]: [WorkflowState.PLAN_CREATED, WorkflowState.DESIGN_DRAFTED],
        [WorkflowState.PLAN_CREATED]: [WorkflowState.USER_APPROVED, WorkflowState.DESIGN_DRAFTED],
        [WorkflowState.USER_APPROVED]: [WorkflowState.GENERATED],
        [WorkflowState.GENERATED]: [WorkflowState.VERIFIED, WorkflowState.PLAN_CREATED],
        [WorkflowState.VERIFIED]: [WorkflowState.DELIVERED],
        [WorkflowState.DELIVERED]: []
    }
};

export class PolicyEngine {
    static canCall(toolName: string, state: WorkflowState, principal: string, traceId: string): { allowed: boolean; reason?: string } {
        const policy = ARCHON_POLICY || { directCallDenylist: [] };
        const denylist = policy.directCallDenylist || [];

        // 1. External Denylist check
        if (principal === "external" && toolName && denylist.includes(toolName)) {
            this.emitDenial(traceId, toolName, state, principal, "Direct call denylisted");
            return { 
                allowed: false, 
                reason: `Direct call to '${toolName}' is blocked. Use governed workflow tools.` 
            };
        }

        // 2. State-based restrictions
        if (!toolName) return { allowed: true }; // Should not happen but for safety
        
        if (toolName === "archon_generate_project" && state !== WorkflowState.USER_APPROVED && state !== WorkflowState.PLAN_CREATED) {
            this.emitDenial(traceId, toolName, state, principal, "archon_generate_project requires PLAN_CREATED or USER_APPROVED state");
            return { allowed: false, reason: "archon_generate_project requires a confirmed plan or approval. Current state: " + state };
        }

        if (toolName === "archon_apply_plan" && (state !== WorkflowState.SPEC_VALIDATED && state !== WorkflowState.PLAN_CREATED && state !== WorkflowState.USER_APPROVED)) {
            this.emitDenial(traceId, toolName, state, principal, "archon_apply_plan requires SPEC_VALIDATED, PLAN_CREATED or USER_APPROVED state");
            return { allowed: false, reason: "archon_apply_plan requires a valid specification or plan. Current state: " + state };
        }

        if (toolName === "archon_generate_from_uml" && (state === WorkflowState.NEW || state === WorkflowState.WORKSPACE_INITIALIZED)) {
            // Allow if initialized
            if (state === WorkflowState.NEW) {
                this.emitDenial(traceId, toolName, state, principal, "archon_generate_from_uml cannot run before workspace initialization");
                return { allowed: false, reason: "archon_generate_from_uml cannot run before workspace initialization. Ensure you have called 'archon_initialize_workspace' and passed the 'workflowId' to this tool." };
            }
        }

        if (toolName === "archon_plan_project" && state !== WorkflowState.SPEC_CREATED && state !== WorkflowState.SPEC_VALIDATED) {
             this.emitDenial(traceId, toolName, state, principal, "archon_plan_project requires SPEC_CREATED or SPEC_VALIDATED state");
             return { allowed: false, reason: "archon_plan_project requires a valid or created specification state." };
        }

        if (toolName === "archon_patch_spec" && state !== WorkflowState.DESIGN_DRAFTED && state !== WorkflowState.SPEC_CREATED) {
            this.emitDenial(traceId, toolName, state, principal, "archon_patch_spec requires DESIGN_DRAFTED or SPEC_CREATED state");
            return { allowed: false, reason: "archon_patch_spec requires DESIGN_DRAFTED or SPEC_CREATED state." };
        }

        if (toolName === "archon_reconcile" && state !== WorkflowState.GENERATED && state !== WorkflowState.VERIFIED) {
            this.emitDenial(traceId, toolName, state, principal, "archon_reconcile requires GENERATED or VERIFIED state");
            return { allowed: false, reason: "archon_reconcile requires a GENERATED or VERIFIED project state." };
        }

        if (toolName.startsWith("archon_materialization_") || toolName === "archon_workflow_materialize") {
            if (toolName !== "archon_materialization_abort" && state !== WorkflowState.USER_APPROVED && state !== WorkflowState.GENERATED) {
                this.emitDenial(traceId, toolName, state, principal, "Materialization tools require USER_APPROVED or GENERATED state");
                return { allowed: false, reason: "Materialization tools require USER_APPROVED or GENERATED state." };
            }
        }

        TelemetryEmitter.emit({
            traceId,
            event: EventType.POLICY_ALLOWED,
            eventType: EventType.POLICY_ALLOWED,
            eventCategory: EventCategory.GOVERNANCE,
            metadata: { toolName, state, principal }
        });

        return { allowed: true };
    }

    private static emitDenial(traceId: string, toolName: string, state: WorkflowState, principal: string, reason: string) {
        console.error(`[TRACE:ARCHON:governance] POLICY DENIED: traceId=${traceId}, tool=${toolName}, state=${state}, reason=${reason}`);
        TelemetryEmitter.emit({
            traceId,
            event: EventType.POLICY_DENIED,
            eventType: EventType.POLICY_DENIED,
            eventCategory: EventCategory.GOVERNANCE,
            metadata: { toolName, state, principal, reason }
        });
    }

    static isLegalTransition(from: WorkflowState, to: WorkflowState): boolean {
        const policy = ARCHON_POLICY || { allowedTransitions: {} };
        const transitions = policy.allowedTransitions || {};
        const allowed = transitions[from] || [];
        return allowed.includes(to);
    }
}
