
/**
 * 🛡️ [GOVERNED BY ARCHON]
 * This file defines the formal Distributed Orchestration Protocol.
 * It is used to transport intent and operations between Remote Engine and Local Materializer.
 */

export type OperationType = "create" | "update" | "delete";

export type ExecutionPlanStatus = "CREATED" | "APPROVED" | "APPLIED" | "FAILED" | "REJECTED";

export interface ExecutionOperation {
    id: string;
    type: OperationType;
    path: string;
    capsuleId: string;
    ownership: string;
    summary: string;
    content?: string; // Inline content for small files
    blobRef?: {
        provider: "s3" | "local";
        url: string;
        hash: string;
    };
    fingerprint: string; // Hash of the nextContent
}

export interface BaseStateCompatibility {
    manifestFingerprint: string; // Expected SHA-256 of .archon/state.json
    criticalArtifacts: Record<string, string>; // path -> hash
}

export interface PlanMetrics {
    operations: number;
    affectedPaths: number;
    sizeBytes: number;
}

export interface ExecutionPlanMetadata {
    planId: string;
    traceId?: string;
    engineVersion: string;
    planSchemaVersion: string; // "1.1.0"
    generatedAt: string;
    sourceMode: 'plan' | 'apply';
    status: ExecutionPlanStatus;
    metrics: PlanMetrics;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    requiresApproval: boolean;
    summary: string; // Human-readable mission summary
    projectName?: string; // Isolated project context
}


export interface ExecutionPlan {
    metadata: ExecutionPlanMetadata;
    baseState: BaseStateCompatibility;
    operations: ExecutionOperation[];
    targetStateFingerprint: string; // Expected fingerprint post-materialization
}

/**
 * 🌊 [STREAMING PROTOCOL]
 * Formal contract for individual operations streamed via SSE.
 */
export interface StreamedExecutionOperation {
    planId: string;
    lineageId: string;
    operationId: string;
    sequence: number;
    total?: number;
    type: OperationType | "mkdir";
    path: string;
    content?: string;
    contentEncoding?: "utf8" | "base64";
    beforeHash?: string;
    afterHash: string;
    capsuleId?: string;
    revisionId: string;
    parentRevisionId?: string;
}

export enum PlanStreamEvent {
    STARTED = "PLAN_STREAM_STARTED",
    OPERATION_READY = "PLAN_OPERATION_READY",
    OPERATION_APPLIED = "PLAN_OPERATION_APPLIED",
    COMMITTED = "PLAN_STREAM_COMMITTED",
    ABORTED = "PLAN_STREAM_ABORTED",
    RESUME_REQUIRED = "PLAN_STREAM_RESUME_REQUIRED",
    TOOL_CALL = "PLAN_TOOL_CALL"
}
