import { TraceModel, SpanModel, TraceInsights } from './models';

export class TraceIntelligenceEngine {
    static analyze(trace: TraceModel): TraceInsights {
        return {
            criticalPath: this.findCriticalPath(trace),
            rootCause: this.findRootCause(trace),
            bottlenecks: this.findBottlenecks(trace)
        };
    }

    private static findCriticalPath(trace: TraceModel): string[] {
        if (trace.spans.length === 0) return [];

        const spanMap = new Map<string, SpanModel>();
        const childrenMap = new Map<string, string[]>();
        let rootId: string | null = null;

        for (const span of trace.spans) {
            spanMap.set(span.spanId, span);
            if (!span.parentSpanId) {
                rootId = span.spanId;
            } else {
                const children = childrenMap.get(span.parentSpanId) || [];
                children.push(span.spanId);
                childrenMap.set(span.parentSpanId, children);
            }
        }

        if (!rootId) return [];

        // Recursive longest path search
        const getLongestPath = (currentId: string): { path: string[], duration: number } => {
            const currentSpan = spanMap.get(currentId)!;
            const children = childrenMap.get(currentId) || [];

            if (children.length === 0) {
                return { path: [currentId], duration: currentSpan.durationMs || 0 };
            }

            let maxChildPath: string[] = [];
            let maxChildDuration = 0;

            for (const childId of children) {
                const result = getLongestPath(childId);
                if (result.duration > maxChildDuration) {
                    maxChildDuration = result.duration;
                    maxChildPath = result.path;
                }
            }

            return {
                path: [currentId, ...maxChildPath],
                duration: (currentSpan.durationMs || 0) + maxChildDuration
            };
        };

        return getLongestPath(rootId).path;
    }

    private static findRootCause(trace: TraceModel): any {
        if (trace.status !== 'FAILED') return undefined;

        // Find the first span that failed (usually the one that triggered the exit)
        const failingSpans = trace.spans
            .filter(s => s.status === 'FAILED')
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

        if (failingSpans.length === 0) return undefined;

        const rootCause = failingSpans[0];
        const errorEvent = rootCause.events.find(e => e.severity === 'ERROR');

        return {
            spanId: rootCause.spanId,
            operation: rootCause.operation,
            message: errorEvent?.message || 'Operation failed without specific error message.'
        };
    }

    private static findBottlenecks(trace: TraceModel): any[] {
        const totalDuration = trace.durationMs || 1;
        
        return trace.spans
            .filter(s => (s.durationMs || 0) > 0)
            .map(s => {
                const percentage = Math.min(100, Math.round(((s.durationMs || 0) / totalDuration) * 100));
                return {
                    spanId: s.spanId,
                    operation: s.operation,
                    durationMs: s.durationMs || 0,
                    percentage
                };
            })
            .sort((a, b) => b.durationMs - a.durationMs)
            .slice(0, 3); // Top 3 bottlenecks
    }

    static getPrimaryCostDriver(trace: TraceModel): any {
        const bottlenecks = this.findBottlenecks(trace);
        return bottlenecks.length > 0 ? bottlenecks[0] : undefined;
    }
}
