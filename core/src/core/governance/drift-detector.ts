import { ArchonState, OwnershipEntry, OwnershipClass } from '../state/state-manager';
import { ObservedState } from './repo-observer';
import { logger } from '../telemetry/logger';

export type DriftType = 
    | "ContentModified"
    | "ArtifactMissing"
    | "SlotBindingRemoved"
    | "StructuralDrift"
    | "OwnershipConflict"
    | "Evolution";

export interface DriftRecord {
    target: string;
    driftType: DriftType;
    severity: "info" | "warn" | "block";
    capsuleId: string;
    ownership: OwnershipClass;
    expectedHash?: string;
    actualHash?: string;
    message: string;
}

/**
 * DriftDetector compares the Desired/Last-Applied State against Observed reality.
 */
export class DriftDetector {
    detect(state: ArchonState, observed: ObservedState): DriftRecord[] {
        const TelemetryEmitter = require('../telemetry/telemetry.js').TelemetryEmitter;
        const startTime = Date.now();
        TelemetryEmitter.emit({
            event: 'DRIFT_SCAN_STARTED',
            eventType: 'DRIFT_SCAN_STARTED',
            eventCategory: 'drift',
            operation: 'drift_scan'
        });

        const records: DriftRecord[] = [];

        for (const [path, entry] of Object.entries(state.ownedArtifacts)) {
            const obs = observed.files[path];

            // 1. Missing Artifacts
            if (obs === undefined) {
                records.push({
                    target: path,
                    driftType: "ArtifactMissing",
                    severity: entry.ownership === 'managed' ? 'block' : 'warn',
                    capsuleId: entry.capsuleId,
                    ownership: entry.ownership,
                    message: `Managed artifact [${path}] is missing from disk.`
                });
                continue;
            }

            // 2. Content Modification (Drift)
            if (obs.hash !== entry.hash) {
                // SEMANTIC CHECK: Compare masked hashes to see if the drift is 'Evolution' (within manual blocks)
                const isEvolution = entry.maskedHash !== undefined && obs.maskedHash === entry.maskedHash;

                if (isEvolution) {
                     logger.debug({ path }, "Evolution drift detected (Manual block changed, boilerplate stable)");
                     records.push({
                        target: path,
                        driftType: "Evolution",
                        severity: "info",
                        capsuleId: entry.capsuleId,
                        ownership: entry.ownership,
                        message: `Manual edit detected in [${path}]. (Evolution drift - Safe)`
                    });
                    continue;
                }

                console.error(`[DEBUG] Unsafe Drift detected for ${path}`);
                console.error(`        Expected Hash: ${entry.hash}`);
                console.error(`        Observed Hash: ${obs.hash}`);
                console.error(`        Expected Masked: ${entry.maskedHash}`);
                console.error(`        Observed Masked: ${obs.maskedHash}`);
                
                const severity = entry.ownership === 'managed' ? 'block' : 'warn';
                
                records.push({
                    target: path,
                    driftType: "ContentModified",
                    severity,
                    capsuleId: entry.capsuleId,
                    ownership: entry.ownership,
                    expectedHash: entry.hash,
                    actualHash: obs.hash,
                    message: `Boilerplate of artifact [${path}] has been modified outside of Archon. (${entry.ownership} ownership)`
                });
            }
        }

        const blockedCount = records.filter(r => r.severity === 'block').length;
        if (records.length > 0) {
            const TelemetryEmitter = require('../telemetry/telemetry.js').TelemetryEmitter;
            TelemetryEmitter.logDriftDetected(records.length, blockedCount);
        }
        TelemetryEmitter.emit({
            event: 'DRIFT_SCAN_COMPLETED',
            eventType: 'DRIFT_SCAN_COMPLETED',
            eventCategory: 'drift',
            operation: 'drift_scan',
            durationMs: Date.now() - startTime,
            status: 'SUCCESS',
            metadata: { driftCount: records.length, blockedCount }
        });

        logger.info({ driftCount: records.length }, "Drift detection completed");
        return records;
    }
}
