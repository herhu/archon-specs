import * as fs from 'fs-extra';
import * as path from 'path';
import { DesignSpec } from '../state/spec';
import { validatePhase26 } from '../validators/validator';
import { TelemetryEmitter } from '../telemetry/telemetry';
import { EventType } from '../telemetry/telemetry-schema';

export enum MissionStatus {
    INIT = 'INIT',
    VALIDATED = 'VALIDATED',
    PLAN_GENERATED = 'PLAN_GENERATED',
    MATERIALIZING = 'MATERIALIZING',
    MATERIALIZED = 'MATERIALIZED',
    VERIFIED = 'VERIFIED',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED'
}

export interface MissionState {
    traceId: string;
    status: MissionStatus;
    projectName: string;
    lastStep: string;
    updatedAt: string;
}

/**
 * ExecutionController: The Deterministic Orchestrator.
 * Enforces a strict state machine on all Archon missions to prevent 
 * non-deterministic tool chaining and structural context degradation.
 */
export class ExecutionController {
    private static missionsDir = path.join(process.cwd(), '.archon', 'missions');

    static async getMission(traceId: string): Promise<MissionState | null> {
        const missionPath = path.join(this.missionsDir, `${traceId}.json`);
        if (await fs.pathExists(missionPath)) {
            return await fs.readJson(missionPath);
        }
        return null;
    }

    static async saveMission(state: MissionState) {
        await fs.ensureDir(this.missionsDir);
        const missionPath = path.join(this.missionsDir, `${state.traceId}.json`);
        state.updatedAt = new Date().toISOString();
        await fs.writeJson(missionPath, state, { spaces: 2 });
    }

    /**
     * Enforce strict sequence: VALIDATE -> PLAN -> APPLY -> VERIFY
     */
    static async transition(traceId: string, nextStatus: MissionStatus, projectName: string) {
        const current = await this.getMission(traceId);
        
        if (!current) {
            if (nextStatus !== MissionStatus.VALIDATED && nextStatus !== MissionStatus.INIT) {
                throw new Error(`Execution Blocked: Cannot transition to ${nextStatus} without initializing mission. Execute validation first.`);
            }
            await this.saveMission({
                traceId,
                status: nextStatus,
                projectName,
                lastStep: nextStatus,
                updatedAt: new Date().toISOString()
            });
            return;
        }

        // Prevent Duplicate Execution of the same stage
        if (current.status === nextStatus && nextStatus !== MissionStatus.VALIDATED) {
            throw new Error(`Execution Blocked: Stage ${nextStatus} already completed for trace ${traceId}. Duplicate execution rejected.`);
        }

        // Enforce Ordering
        const allowedTransitions: Record<MissionStatus, MissionStatus[]> = {
            [MissionStatus.INIT]: [MissionStatus.VALIDATED],
            [MissionStatus.VALIDATED]: [MissionStatus.PLAN_GENERATED, MissionStatus.VALIDATED, MissionStatus.MATERIALIZING],
            [MissionStatus.PLAN_GENERATED]: [MissionStatus.MATERIALIZING, MissionStatus.VALIDATED],
            [MissionStatus.MATERIALIZING]: [MissionStatus.MATERIALIZED, MissionStatus.FAILED, MissionStatus.VALIDATED],
            [MissionStatus.MATERIALIZED]: [MissionStatus.VERIFIED, MissionStatus.VALIDATED],
            [MissionStatus.VERIFIED]: [MissionStatus.COMPLETED, MissionStatus.VALIDATED],
            [MissionStatus.FAILED]: [MissionStatus.VALIDATED],
            [MissionStatus.COMPLETED]: [MissionStatus.VALIDATED]
        };

        if (!allowedTransitions[current.status].includes(nextStatus)) {
             throw new Error(`Out-of-Order Execution: Cannot transition from ${current.status} to ${nextStatus}. Please follow the deterministic sequence: VALIDATE -> PLAN -> APPLY.`);
        }

        current.status = nextStatus;
        current.lastStep = nextStatus;
        await this.saveMission(current);
    }

    /**
     * Guard: Ensure the spec is structurally sound before any tool execution.
     */
    static guard(spec: any) {
        const errors = validatePhase26(spec);
        if (errors.length > 0) {
            TelemetryEmitter.emit({
                event: 'GOVERNANCE_VIOLATION',
                eventType: EventType.IMMUNE_SYSTEM_TRIGGERED,
                metadata: { errors, stage: 'controller_guard' }
            });
            throw new Error(`Architectural Guard Triggered: The provided DesignSpec is invalid or corrupted. ERRORS: ${errors.join(', ')}`);
        }
    }
}
