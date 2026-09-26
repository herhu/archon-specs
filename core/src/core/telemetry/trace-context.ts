import * as crypto from 'node:crypto';

export interface TraceContext {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    requestId?: string;
    sessionId?: string;
    workspaceId?: string;
    actorId?: string;
}

export class TraceManager {
    static createRoot(requestId?: string, sessionId?: string): TraceContext {
        return {
            traceId: this.generateId(),
            spanId: this.generateId(),
            requestId,
            sessionId
        };
    }

    static resume(traceId: string): TraceContext {
        return {
            traceId,
            spanId: this.generateId(),
        };
    }

    static createChild(parent: TraceContext): TraceContext {
        return {
            ...parent,
            parentSpanId: parent.spanId,
            spanId: this.generateId()
        };
    }

    private static generateId(): string {
        try {
            return crypto.randomUUID();
        } catch {
            // Fallback for environments without randomUUID
            return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        }
    }
}
