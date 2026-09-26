import { StateManager, ArchonState, PlanRecord } from '../state/state-manager';
import { TelemetryEmitter } from './telemetry';
import * as fs from 'fs';
import * as path from 'path';

export interface PlatformMetrics {
    successRate: number;
    rejectionRate: number;
    driftDetectionRate: number;
    totalPlans: number;
    riskDistribution: {
        LOW: number;
        MEDIUM: number;
        HIGH: number;
    };
    recentAuditTrail: PlanRecord[];
}

export class MetricsCalculator {
    constructor(private readonly outDir: string) {}

    async calculate(): Promise<PlatformMetrics> {
        const stateManager = new StateManager(this.outDir);
        const state = await stateManager.load();
        
        const history = state.planHistory || [];
        const total = history.length;
        
        if (total === 0) {
            return {
                successRate: 0,
                rejectionRate: 0,
                driftDetectionRate: 0,
                totalPlans: 0,
                riskDistribution: { LOW: 0, MEDIUM: 0, HIGH: 0 },
                recentAuditTrail: []
            };
        }

        const applied = history.filter(h => h.status === 'APPLIED').length;
        const rejected = history.filter(h => h.status === 'REJECTED').length;
        const failed = history.filter(h => h.status === 'FAILED').length;

        // Drift specifically
        const driftRejections = history.filter(h => h.status === 'REJECTED' && (h as any).reason?.includes('DRIFT')).length;

        const lowRisk = history.filter(h => h.riskLevel === 'LOW').length;
        const mediumRisk = history.filter(h => h.riskLevel === 'MEDIUM').length;
        const highRisk = history.filter(h => h.riskLevel === 'HIGH').length;

        return {
            successRate: (applied / total) * 100,
            rejectionRate: (rejected / total) * 100,
            driftDetectionRate: (driftRejections / total) * 100,
            totalPlans: total,
            riskDistribution: {
                LOW: lowRisk,
                MEDIUM: mediumRisk,
                HIGH: highRisk
            },
            recentAuditTrail: history.slice(0, 10)
        };
    }

    /**
     * Aggregates telemetry from JSONL for long-term trends
     */
    async aggregateTelemetry(): Promise<any> {
        const telemetryPath = path.join(this.outDir, '.archon', 'telemetry.jsonl');
        if (!fs.existsSync(telemetryPath)) return {};

        const content = fs.readFileSync(telemetryPath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        
        const events = lines.map(l => JSON.parse(l));
        
        return {
            totalEvents: events.length,
            driftCounts: events.filter(e => e.event === 'DRIFT_DETECTED').length,
            errors: events.filter(e => e.severity === 'ERROR').length
        };
    }
}
