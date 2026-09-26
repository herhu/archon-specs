import * as fs from 'fs';
import * as path from 'path';
import { RiskLevel } from '../governance/risk-classifier';
import { TELEMETRY_SCHEMA_VERSION, EventCategory, EventType, Severity, ToolCategory } from './telemetry-schema';

export interface TelemetryEvent {
    eventId?: string;
    event: string; // Legacy field for compatibility
    timestamp?: string;
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;
    requestId?: string;
    sessionId?: string;
    workspaceId?: string;
    actorId?: string;
    eventType?: EventType | string;
    eventCategory?: EventCategory | string;
    status?: string;
    reason?: string;
    metrics?: any;
    metadata?: Record<string, any>;
    severity?: Severity | string;
    component?: string;
    operation?: string;
    durationMs?: number;
    planId?: string;
    riskLevel?: RiskLevel;
    projectName?: string;
    schemaVersion?: string;
    serverName?: string;
    toolName?: string;
    toolCategory?: ToolCategory | string;
    attempt?: number;
    retryCount?: number;
    downstreamServer?: string;
    downstreamTool?: string;
    policyMode?: string;
    revisionId?: string;
    isInternal?: boolean;
}

export class TelemetryEmitter {
    private static workspaceRoot: string | null = null;
    private static globalContext: Partial<TelemetryEvent> = {};

    static setWorkspace(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        const archonDir = path.join(workspaceRoot, '.archon');
        if (!fs.existsSync(archonDir)) {
            fs.mkdirSync(archonDir, { recursive: true });
        }
    }

    static setGlobalContext(context: Partial<TelemetryEvent>) {
        this.globalContext = { ...this.globalContext, ...context };
    }

    static emit(event: TelemetryEvent) {
        const projectName = event.projectName || this.globalContext.projectName;
        let sinkPath: string | null = null;

        if (this.workspaceRoot) {
            const archonDir = path.join(this.workspaceRoot, '.archon');
            if (projectName) {
                sinkPath = path.join(archonDir, 'projects', projectName, 'telemetry.jsonl');
            } else {
                sinkPath = path.join(archonDir, 'global', 'telemetry.jsonl');
            }
        } else {
            // Lazy search for .archon folder in CWD or parents for legacy/CLI support
            let curr = process.cwd();
            while (curr !== path.parse(curr).root) {
                const archonDir = path.join(curr, '.archon');
                if (fs.existsSync(archonDir)) {
                    if (projectName) {
                        sinkPath = path.join(archonDir, 'projects', projectName, 'telemetry.jsonl');
                    } else {
                        sinkPath = path.join(archonDir, 'telemetry.jsonl'); // Legacy fallback
                    }
                    break;
                }
                curr = path.dirname(curr);
            }
        }
        
        if (!sinkPath) return;

        const entry = JSON.stringify({
            eventId: Math.random().toString(36).substring(2, 15),
            timestamp: new Date().toISOString(),
            severity: Severity.INFO,
            schemaVersion: TELEMETRY_SCHEMA_VERSION,
            ...this.globalContext,
            ...event
        }) + '\n';

        try {
            const dir = path.dirname(sinkPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.appendFileSync(sinkPath, entry);
        } catch (err) {
            console.error('[Archon Telemetry] Failed to write event:', err);
        }
    }


    static logPlanGenerated(planId: string, risk: RiskLevel, metrics: any) {
        this.emit({
            event: EventType.PLAN_GENERATED,
            eventType: EventType.PLAN_GENERATED,
            eventCategory: EventCategory.ORCHESTRATOR,
            planId,
            riskLevel: risk,
            metrics,
            status: 'PENDING',
            operation: 'plan_generation'
        });
    }

    static logPlanApplied(planId: string, risk: RiskLevel) {
        this.emit({
            event: EventType.PLAN_APPLIED,
            eventType: EventType.PLAN_APPLIED,
            eventCategory: EventCategory.ORCHESTRATOR,
            planId,
            riskLevel: risk,
            status: 'SUCCESS',
            operation: 'plan_application'
        });
    }

    static logPlanRejected(planId: string, reason: string) {
        this.emit({
            event: EventType.PLAN_REJECTED,
            eventType: EventType.PLAN_REJECTED,
            eventCategory: EventCategory.ORCHESTRATOR,
            planId,
            reason,
            status: 'REJECTED',
            severity: Severity.WARN,
            operation: 'plan_application'
        });
    }

    static logPlanFailed(planId: string, error: string) {
        this.emit({
            event: EventType.PLAN_FAILED,
            eventType: EventType.PLAN_FAILED,
            eventCategory: EventCategory.ORCHESTRATOR,
            planId,
            reason: error,
            status: 'FAILED',
            severity: Severity.ERROR,
            operation: 'plan_application'
        });
    }

    static logOrchestrationStarted(traceId: string) {
        this.emit({
            event: EventType.ORCHESTRATION_STARTED,
            eventType: EventType.ORCHESTRATION_STARTED,
            eventCategory: EventCategory.ORCHESTRATOR,
            traceId,
            status: 'IN_PROGRESS',
            operation: 'orchestration'
        });
    }

    static logOrchestrationCompleted(traceId: string, status: 'SUCCESS' | 'FAILED' = 'SUCCESS') {
        this.emit({
            event: status === 'SUCCESS' ? EventType.ORCHESTRATION_COMPLETED : EventType.ORCHESTRATION_FAILED,
            eventType: status === 'SUCCESS' ? EventType.ORCHESTRATION_COMPLETED : EventType.ORCHESTRATION_FAILED,
            eventCategory: EventCategory.ORCHESTRATOR,
            traceId,
            status,
            operation: 'orchestration'
        });
    }

    static logDriftDetected(driftCount: number, blockedCount: number = 0) {
        this.emit({
            event: EventType.DRIFT_DETECTED,
            eventType: EventType.DRIFT_DETECTED,
            eventCategory: EventCategory.DRIFT,
            metrics: { driftCount, blockedCount },
            severity: blockedCount > 0 ? Severity.WARN : Severity.INFO,
            operation: 'drift_scan'
        });
    }

    static logDrift(driftCount: number, blockedCount: number = 0) {
        this.logDriftDetected(driftCount, blockedCount);
    }

    static logMcpToolStarted(traceId: string, toolName: string, input: any, metadata: Partial<TelemetryEvent> = {}) {
        const spanId = metadata.spanId || `span-${Math.random().toString(36).substring(2, 10)}`;
        this.emit({
            event: EventType.MCP_TOOL_STARTED,
            eventType: EventType.MCP_TOOL_STARTED,
            eventCategory: EventCategory.MCP,
            traceId,
            spanId,
            operation: `mcp_tool:${toolName}`,
            metadata: { toolName, input },
            status: 'IN_PROGRESS',
            toolName,
            ...metadata
        });
        return spanId;
    }

    static logMcpToolCompleted(traceId: string, toolName: string, durationMs: number, status: 'SUCCESS' | 'FAILED' = 'SUCCESS', spanId?: string, output?: any, metadata: Partial<TelemetryEvent> = {}) {
        this.emit({
            event: status === 'SUCCESS' ? EventType.MCP_TOOL_COMPLETED : EventType.MCP_TOOL_FAILED,
            eventType: status === 'SUCCESS' ? EventType.MCP_TOOL_COMPLETED : EventType.MCP_TOOL_FAILED,
            eventCategory: EventCategory.MCP,
            traceId,
            spanId,
            operation: `mcp_tool:${toolName}`,
            durationMs,
            status,
            metadata: { output, ...metadata.metadata },
            ...metadata
        });
    }

    static logMcpToolFailed(traceId: string, toolName: string, error: string, durationMs: number, spanId?: string, metadata: Partial<TelemetryEvent> = {}) {
        this.emit({
            event: EventType.MCP_TOOL_FAILED,
            eventType: EventType.MCP_TOOL_FAILED,
            eventCategory: EventCategory.MCP,
            traceId,
            spanId,
            operation: `mcp_tool:${toolName}`,
            durationMs,
            status: 'FAILED',
            severity: Severity.ERROR,
            reason: error,
            metadata: { error, ...metadata.metadata },
            ...metadata
        });
    }
}
