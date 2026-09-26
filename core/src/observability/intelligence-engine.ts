import { TraceModel } from './models';
import { EventType } from '../core/telemetry/telemetry-schema';

export interface CrossTraceIntelligence {
    recurringIssues: {
        type: 'failure' | 'drift' | 'latency';
        target: string;
        frequency: number;
        severity: 'high' | 'medium' | 'low';
        lastSeen: string;
    }[];
    artifactStability: {
        path: string;
        mutationCount: number;
        stabilityScore: number; // 0 to 1
    }[];
    systemHealth: {
        successRate: number;
        avgDurationMs: number;
        verificationRate: number;
    };
}

/**
 * CrossTraceAnalyzer: Analyzes patterns across multiple execution traces.
 * Identifies systemic weaknesses and recurring architectural drift.
 */
export class CrossTraceAnalyzer {
    static analyze(traces: TraceModel[]): CrossTraceIntelligence {
        const recentTraces = traces.slice(0, 50); // Analyze last 50 traces
        
        const failureCounts: Record<string, number> = {};
        const driftCounts: Record<string, number> = {};
        const mutationCounts: Record<string, number> = {};
        const categoryDurations: Record<string, number[]> = {};
        
        let successCount = 0;
        let verifiedCount = 0;
        let totalDuration = 0;

        for (const trace of recentTraces) {
            if (trace.status === 'SUCCESS') successCount++;
            if (trace.outcome?.status === 'VERIFIED') verifiedCount++;
            if (trace.durationMs) {
                totalDuration += trace.durationMs;
            }

            for (const span of trace.spans) {
                // Track failures by operation/tool
                if (span.status === 'FAILED') {
                    const key = `${span.serverName || 'core'}:${span.operation}`;
                    failureCounts[key] = (failureCounts[key] || 0) + 1;
                }

                // Track mutations
                if (span.metadata?.path) {
                    mutationCounts[span.metadata.path] = (mutationCounts[span.metadata.path] || 0) + 1;
                }
                if (span.metadata?.paths && Array.isArray(span.metadata.paths)) {
                    for (const p of span.metadata.paths) {
                        mutationCounts[p] = (mutationCounts[p] || 0) + 1;
                    }
                }

                // Track drift events
                span.events.forEach(e => {
                    if (e.eventType === 'DRIFT_DETECTED') {
                        const path = e.metadata?.path || 'unknown';
                        driftCounts[path] = (driftCounts[path] || 0) + 1;
                    }
                });

                // Track durations by category
                if (span.toolCategory && span.durationMs) {
                    if (!categoryDurations[span.toolCategory]) categoryDurations[span.toolCategory] = [];
                    categoryDurations[span.toolCategory].push(span.durationMs);
                }
            }
        }

        const recurringIssues: CrossTraceIntelligence['recurringIssues'] = [];

        // Identify high-failure tools
        Object.entries(failureCounts).forEach(([target, count]) => {
            if (count >= 3) {
                recurringIssues.push({
                    type: 'failure',
                    target,
                    frequency: count / recentTraces.length,
                    severity: count >= 10 ? 'high' : 'medium',
                    lastSeen: recentTraces[0].startTime
                });
            }
        });

        // Identify recurring drift artifacts
        Object.entries(driftCounts).forEach(([target, count]) => {
            if (count >= 2) {
                recurringIssues.push({
                    type: 'drift',
                    target,
                    frequency: count / recentTraces.length,
                    severity: 'medium',
                    lastSeen: recentTraces[0].startTime
                });
            }
        });

        const artifactStability = Object.entries(mutationCounts)
            .map(([path, count]) => ({
                path,
                mutationCount: count,
                stabilityScore: Math.max(0, 1 - (count / 10)) // Simple inverse linear score
            }))
            .sort((a, b) => a.stabilityScore - b.stabilityScore)
            .slice(0, 10);

        return {
            recurringIssues: recurringIssues.sort((a, b) => b.frequency - a.frequency),
            artifactStability,
            systemHealth: {
                successRate: recentTraces.length > 0 ? (successCount / recentTraces.length) * 100 : 100,
                avgDurationMs: recentTraces.length > 0 ? totalDuration / recentTraces.length : 0,
                verificationRate: recentTraces.length > 0 ? (verifiedCount / recentTraces.length) * 100 : 0
            }
        };
    }
}
