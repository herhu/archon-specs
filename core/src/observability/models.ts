import { EventCategory, EventType, Severity } from '../core/telemetry/telemetry-schema';

export interface TraceModel {
    traceId: string;
    rootSpanId?: string;
    startTime: string;
    endTime?: string;
    durationMs?: number;
    status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS';
    outcome?: {
        status: 'VERIFIED' | 'FAILED' | 'PENDING';
        reason?: string;
    };
    workspaceId?: string;
    actorId?: string;
    projectName?: string;
    metadata?: Record<string, any>;
    spans: SpanModel[];
    insights?: TraceInsights;
}

export interface SpanModel {
    spanId: string;
    parentSpanId?: string;
    traceId: string;
    operation: string;
    startTime: string;
    endTime?: string;
    durationMs?: number;
    status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS';
    category: EventCategory | string;
    serverName?: string;
    toolCategory?: string;
    metadata: Record<string, any>;
    events: EventModel[];
}

export interface EventModel {
    eventId: string;
    timestamp: string;
    eventType: EventType | string;
    severity: Severity | string;
    message?: string;
    metadata: Record<string, any>;
}

export interface ArtifactLineage {
    path: string;
    lastTraceId?: string;
    lastPlanId?: string;
    projectName?: string;
    owningCapsuleId?: string;
    history: {
        timestamp: string;
        traceId: string;
        planId: string;
        type: 'create' | 'update' | 'delete';
    }[];
}

export interface TraceInsights {
    criticalPath: string[];
    rootCause?: {
        spanId: string;
        operation: string;
        message: string;
    };
    bottlenecks: {
        spanId: string;
        operation: string;
        durationMs: number;
        percentage: number;
    }[];
}
