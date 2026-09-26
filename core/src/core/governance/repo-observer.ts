import * as fs from 'fs-extra';
import * as path from 'path';
import { ArchonState, StateManager } from '../state/state-manager';
import { logger } from '../telemetry/logger';
import { VirtualTree } from '../vfs/vfs';

export interface ObservedState {
    files: Record<string, { hash: string, maskedHash: string }>; // path -> semantic hashes
    slotBindings: Record<string, string[]>; // slotId -> binding fingerprints (from actual files)
}

/**
 * RepoObserver is responsible for scanning the physical/virtual reality of the project
 * to see what actually exists for the artifacts Archon believes it owns.
 */
export class RepoObserver {
    constructor(private readonly tree: VirtualTree) {}

    /**
     * Scans reality based on the last known state. 
     * Efficiently only hashes files that are in the manifest.
     */
    async observe(state: ArchonState): Promise<ObservedState> {
        const artifactCount = Object.keys(state.ownedArtifacts).length;
        logger.info({ artifactCount }, "Observing repository reality");
        
        const { TelemetryEmitter } = await import("../telemetry/telemetry.js");
        const startTime = Date.now();

        TelemetryEmitter.emit({
            event: 'REPO_OBSERVE_STARTED',
            eventType: 'REPO_OBSERVE_STARTED',
            eventCategory: 'repo',
            operation: 'repo_observation',
            metadata: { artifactCount }
        });

        const observed: ObservedState = {
            files: {},
            slotBindings: {}
        };

        for (const [filePath, entry] of Object.entries(state.ownedArtifacts)) {
            // 1. File Visibility & Content Hash
            try {
                // Invalidate the VFS cache for this path to ensure we see the latest disk reality,
                // not a stale in-process buffer from a previous scan/apply.
                (this.tree as any).invalidate?.(filePath);
                
                const content = await this.tree.read(filePath);
                const { HashUtil } = await import("../utils/hash-util.js");
                
                if (content !== undefined) {
                    observed.files[filePath] = {
                        hash: HashUtil.calculateHash(content),
                        maskedHash: HashUtil.calculateMaskedHash(filePath, content)
                    };
                } else {
                    logger.debug({ filePath }, "Observed artifact missing from disk");
                }
            } catch (err) {
                logger.warn({ filePath, error: (err as Error).message }, "Failed to observe artifact");
            }

            // 2. Slot Fingerprinting (If applicable)
            if (entry.semanticKey) {
                // TODO: Sub-file semantic observation (Requires parsing the file to see if symbol exists)
                // For V1, we'll rely on the file hash for 'Managed' and 'Shared' files.
                // Deep semantic observation will be added in V2.
            }
        }

        TelemetryEmitter.emit({
            event: 'REPO_OBSERVE_COMPLETED',
            eventType: 'REPO_OBSERVE_COMPLETED',
            eventCategory: 'repo',
            operation: 'repo_observation',
            durationMs: Date.now() - startTime,
            status: 'SUCCESS',
            metadata: { observedCount: Object.keys(observed.files).length }
        });

        return observed;
    }
}
