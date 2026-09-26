import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../telemetry/logger';

export type OwnershipClass = "managed" | "shared" | "manual-protected";

export interface OwnershipEntry {
    path: string;
    hash: string;
    maskedHash?: string; // Semantic hash (ignoring @ArchonManual blocks)
    ownership: OwnershipClass;
    capsuleId: string;
    semanticKey?: string; // For slots, e.g. "symbol:BookingModule"
}

export interface CapsuleState {
    capsuleId: string;
    version: string;
    appliedAt: string;
    specFingerprint: string;
}

export interface AppliedPlanRecord {
    planId: string;
    traceId?: string;
    appliedAt: string;
    planSchemaVersion: string;
    engineVersion: string;
    fingerprint: string; // targetStateFingerprint
}

export interface PlanRecord {
    planId: string;
    traceId?: string;
    status: 'PENDING' | 'APPLIED' | 'REJECTED' | 'FAILED';
    timestamp: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    summary: string;
    error?: string;
}

export interface ArchonState {
    version: string; // State manifest version (schema)
    engineVersion: string; // The version of Archon that last touched this manifest
    lastAppliedAt: string;
    appliedPlans: AppliedPlanRecord[];
    planHistory: PlanRecord[]; // New: Full history including rejections/failures for audit trail
    capsules: Record<string, CapsuleState>;
    ownedArtifacts: Record<string, OwnershipEntry>;
    spec?: any; // The last applied DesignSpec
}

import { ExecutionPlan } from '../engine/execution-plan';

export const ARCHON_ENGINE_VERSION = "2.0.0-cla";
export const STATE_MANIFEST_VERSION = "1.2.0"; // Incremented version
export const STATE_FILE_NAME = ".archon/state.json";

export class StateManager {
    private statePath: string;

    constructor(private readonly workspaceDir: string) {
        this.statePath = path.join(workspaceDir, STATE_FILE_NAME);
    }

    async load(): Promise<ArchonState> {
        if (!await fs.pathExists(this.statePath)) {
            return this.getEmptyState();
        }

        try {
            const data = await fs.readJson(this.statePath);
            return data as ArchonState;
        } catch (err: any) {
            logger.error({ error: err.message }, "Failed to load Archon State Manifest. Starting with empty state.");
            return this.getEmptyState();
        }
    }

    async save(state: ArchonState): Promise<void> {
        try {
            await fs.ensureDir(path.dirname(this.statePath));
            await fs.writeJson(this.statePath, state, { spaces: 2 });
            logger.info({ path: this.statePath }, "Archon State Manifest persisted atomically");

            const { TelemetryEmitter } = await import("../telemetry/telemetry.js");
            TelemetryEmitter.emit({
                event: 'STATE_SAVED',
                eventType: 'STATE_SAVED',
                eventCategory: 'state',
                operation: 'state_persist',
                status: 'SUCCESS',
                metadata: { artifactCount: Object.keys(state.ownedArtifacts).length }
            });
        } catch (err: any) {
            logger.error({ error: err.message }, "CRITICAL: Failed to persist Archon State Manifest");
            throw new Error(`State Persistence Failed: ${err.message}`);
        }
    }

    private getEmptyState(): ArchonState {
        return {
            version: STATE_MANIFEST_VERSION,
            engineVersion: ARCHON_ENGINE_VERSION,
            lastAppliedAt: new Date(0).toISOString(),
            appliedPlans: [],
            planHistory: [],
            capsules: {},
            ownedArtifacts: {}
        };
    }

    async archivePlan(plan: ExecutionPlan): Promise<void> {
        try {
            const planDir = path.join(this.workspaceDir, ".archon/plans");
            await fs.ensureDir(planDir);
            
            // Archive metadata + summary + metrics (no full content blobs to save space)
            const archiveEntry = {
                metadata: plan.metadata,
                baseState: { manifestFingerprint: plan.baseState.manifestFingerprint },
                targetStateFingerprint: plan.targetStateFingerprint,
                operationCount: plan.operations.length
            };

            const planPath = path.join(planDir, `${plan.metadata.planId}.json`);
            await fs.writeJson(planPath, archiveEntry, { spaces: 2 });
            logger.info({ planId: plan.metadata.planId }, "Execution Plan archived locally");
        } catch (err: any) {
            logger.warn({ error: err.message }, "Failed to archive execution plan");
        }
    }

    static calculateHash(content: string): string {
        // Normalization: LF line endings and trimmed whitespace to avoid environment drift
        const normalized = content.replace(/\r\n/g, '\n').trim();
        return crypto.createHash('sha256').update(normalized).digest('hex');
    }

    static calculateFingerprint(obj: any): string {
        // Deterministic JSON serialization for fingerprinting objects (slots, etc)
        const sorted = Object.keys(obj).sort().reduce((acc: any, key) => {
            acc[key] = obj[key];
            return acc;
        }, {});
        return this.calculateHash(JSON.stringify(sorted));
    }
}
