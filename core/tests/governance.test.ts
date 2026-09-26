import { describe, it, expect, vi } from "vitest";
import { PolicyEngine, WorkflowState, ARCHON_POLICY } from "../src/core/governance.js";

// Mock TelemetryEmitter to avoid side effects
vi.mock("../src/core/telemetry.js", () => ({
    TelemetryEmitter: {
        emit: vi.fn()
    }
}));

describe("Archon Governance Policy", () => {
    const TRACE_ID = "test-trace";

    describe("Tool Surface Governance", () => {
        it("should block direct access to denylisted tools for external callers", () => {
            for (const tool of ARCHON_POLICY.directCallDenylist) {
                const result = PolicyEngine.canCall(tool, WorkflowState.NEW, "external", TRACE_ID);
                expect(result.allowed).toBe(false);
                expect(result.reason).toContain("blocked");
            }
        });

        it("should allow governed tools for external callers", () => {
            const allowed = ["archon_workflow_start", "archon_policy_explain"];
            for (const tool of allowed) {
                const result = PolicyEngine.canCall(tool, WorkflowState.NEW, "external", TRACE_ID);
                expect(result.allowed).toBe(true);
            }
        });
    });

    describe("State-Based Restrictions", () => {
        it("should deny generation before plan is created (even for internal principal)", () => {
            // Policy allows generation in PLAN_CREATED and USER_APPROVED states.
            // States before a plan is confirmed must be denied.
            const states = [WorkflowState.NEW, WorkflowState.DESIGN_DRAFTED];
            for (const state of states) {
                const resultExternal = PolicyEngine.canCall("archon_generate_project", state, "external", TRACE_ID);
                const resultInternal = PolicyEngine.canCall("archon_generate_project", state, "internal", TRACE_ID);

                expect(resultExternal.allowed).toBe(false);
                expect(resultInternal.allowed).toBe(false);
            }
        });

        it("should allow generation in PLAN_CREATED or USER_APPROVED state", () => {
            const planCreated = PolicyEngine.canCall("archon_generate_project", WorkflowState.PLAN_CREATED, "internal", TRACE_ID);
            expect(planCreated.allowed).toBe(true);

            const userApproved = PolicyEngine.canCall("archon_generate_project", WorkflowState.USER_APPROVED, "internal", TRACE_ID);
            expect(userApproved.allowed).toBe(true);
        });

        it("should deny UML generation before workspace initialization", () => {
            const result = PolicyEngine.canCall("archon_generate_from_uml", WorkflowState.NEW, "internal", TRACE_ID);
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain("workspace initialization");
        });

        it("should deny reconciliation before project is generated", () => {
            const result = PolicyEngine.canCall("archon_reconcile", WorkflowState.DESIGN_DRAFTED, "internal", TRACE_ID);
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain("GENERATED");
        });
    });

    describe("Workflow Transition Integrity", () => {
        it("should allow legal transitions", () => {
            expect(PolicyEngine.isLegalTransition(WorkflowState.NEW, WorkflowState.WORKSPACE_INITIALIZED)).toBe(true);
            expect(PolicyEngine.isLegalTransition(WorkflowState.PLAN_CREATED, WorkflowState.USER_APPROVED)).toBe(true);
        });

        it("should deny illegal transitions (e.g. skipping steps)", () => {
            expect(PolicyEngine.isLegalTransition(WorkflowState.NEW, WorkflowState.USER_APPROVED)).toBe(false);
            expect(PolicyEngine.isLegalTransition(WorkflowState.DESIGN_DRAFTED, WorkflowState.GENERATED)).toBe(false);
        });

        it("should deny backward transitions unless explicitly allowed (none defined yet)", () => {
            expect(PolicyEngine.isLegalTransition(WorkflowState.GENERATED, WorkflowState.DESIGN_DRAFTED)).toBe(false);
        });
    });
});
