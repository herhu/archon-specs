import * as fs from 'fs-extra';
import * as path from 'path';
import { VirtualTree } from '../vfs/vfs';
import { StateManager, ArchonState } from '../state/state-manager';
import { 
    ExecutionPlanMetadata, 
    BaseStateCompatibility, 
    StreamedExecutionOperation, 
    PlanStreamEvent 
} from './execution-plan';
import { DriftDetector } from '../governance/drift-detector';
import { RepoObserver } from '../governance/repo-observer';
import { ReconciliationPolicy } from '../governance/reconciliation-policy';
import { TelemetryEmitter } from '../telemetry/telemetry';
import { logger } from '../telemetry/logger';
import { HashUtil } from '../utils/hash-util';
import { LineageManager } from '../state/lineage-manager';

export interface StreamJournalEntry {
    operationId: string;
    sequence: number;
    path: string;
    beforeHash?: string;
    afterHash: string;
    status: 'PENDING' | 'APPLIED' | 'FAILED' | 'COMMITTED';
    timestamp: string;
}

export class StreamMaterializer {
    private vfs: VirtualTree;
    private stateManager: StateManager;
    private journalPath: string;
    private lastSequence: number = 0;
    private planId?: string;
    private lineageManager: LineageManager;
    private lockPath: string;

    constructor(private readonly outDir: string, private readonly externalTraceId?: string) {
        this.vfs = new VirtualTree(outDir);
        this.stateManager = new StateManager(outDir);
        this.lineageManager = new LineageManager(outDir);
        this.journalPath = '';
        this.lockPath = path.join(outDir, '.archon', 'materializations', 'LOCK');
    }

    async begin(metadata: ExecutionPlanMetadata, baseState: BaseStateCompatibility): Promise<void> {
        console.error(`[TRACE:CLIENT:stream-materializer] Beginning materialization session. PlanId: ${metadata.planId}`);
        // 🔒 1. Session Locking
        await this.acquireLock(metadata.planId);

        this.planId = metadata.planId;
        const matDir = path.join(this.outDir, '.archon', 'materializations', this.planId);
        await fs.ensureDir(matDir);
        this.journalPath = path.join(matDir, 'journal.jsonl');

        const currentState = await this.stateManager.load();
        
        // 🛡️ Base-State Compatibility Check
        const currentFingerprint = StateManager.calculateFingerprint(currentState);
        if (baseState.manifestFingerprint !== 'init' && baseState.manifestFingerprint !== currentFingerprint) {
            throw new Error(`STALE_PLAN: Manifest fingerprint mismatch. Expected ${baseState.manifestFingerprint}, got ${currentFingerprint}`);
        }

        // 🛡️ Drift Evaluation
        const observer = new RepoObserver(this.vfs);
        const observedState = await observer.observe(currentState);
        const detector = new DriftDetector();
        const driftRecords = detector.detect(currentState, observedState);
        const policy = new ReconciliationPolicy();
        const assessment = policy.evaluate(driftRecords);

        if (assessment.action === 'Block') {
            throw new Error(`DRIFT_BLOCK: ${assessment.reason}`);
        }

        // Initialize Journal if new
        if (!await fs.pathExists(this.journalPath)) {
            await fs.writeFile(this.journalPath, '');
        } else {
            // Recover last sequence
            const journal = await this.readJournal();
            this.lastSequence = journal.length > 0 ? Math.max(...journal.map(j => j.sequence)) : 0;
        }

        // 🛡️ Re-initialize LineageManager with project context if available
        if (metadata.projectName) {
            this.lineageManager = new LineageManager(this.outDir, metadata.projectName);
        }

        TelemetryEmitter.emit({
            event: PlanStreamEvent.STARTED,
            eventType: 'MATERIALIZATION_STARTED',
            eventCategory: 'materializer',
            projectName: metadata.projectName,
            planId: this.planId,
            metadata: { traceId: this.externalTraceId || metadata.traceId }
        });
    }


    async applyOperation(op: StreamedExecutionOperation): Promise<void> {
        if (!this.planId || this.planId !== op.planId) {
            throw new Error(`PLAN_MISMATCH: Expected ${this.planId}, got ${op.planId}`);
        }

        // 🛡️ Sequence Validation
        if (op.sequence > this.lastSequence + 1) {
            throw new Error(`SEQUENCE_GAP: Expected ${this.lastSequence + 1}, got ${op.sequence}. RESUME_REQUIRED.`);
        }

        // 🛡️ Replay Protection & Re-staging
        const journal = await this.readJournal();
        const existing = journal.find(j => j.operationId === op.operationId && j.status === 'APPLIED');
        if (existing) {
            logger.info({ operationId: op.operationId }, "Operation already in journal. Re-staging in VFS.");
            await this.stageInVfs(op);
            this.lastSequence = Math.max(this.lastSequence, op.sequence);
            return;
        }

        // 🛡️ Integrity Check
        if (op.content) {
            const actualHash = HashUtil.calculateHash(op.content);
            if (actualHash !== op.afterHash) {
                throw new Error(`INTEGRITY_FAILURE: Hash mismatch for ${op.path}`);
            }
        }

        // 🛡️ Path Sandboxing (Hardened)
        const absoluteWorkspace = path.resolve(this.outDir);
        const absoluteTarget = path.resolve(this.outDir, op.path);
        if (!absoluteTarget.startsWith(absoluteWorkspace)) {
            throw new Error(`SECURITY_VIOLATION: Path escape attempt: ${op.path}`);
        }

        // 🛡️ FS-Level Idempotency
        if (await fs.pathExists(absoluteTarget)) {
            const currentContent = await fs.readFile(absoluteTarget, 'utf8');
            const currentHash = HashUtil.calculateHash(currentContent);
            if (currentHash === op.afterHash) {
                logger.info({ path: op.path }, "FS Idempotency: File already matches target state. Skipping write.");
                this.lastSequence = op.sequence;
                return;
            }
        }

        // 📝 Journal PENDING
        const entry: StreamJournalEntry = {
            operationId: op.operationId,
            sequence: op.sequence,
            path: op.path,
            beforeHash: op.beforeHash,
            afterHash: op.afterHash,
            status: 'PENDING',
            timestamp: new Date().toISOString()
        };
        await fs.appendFile(this.journalPath, JSON.stringify(entry) + '\n');

        // 🏗️ Stage in VFS
        try {
            await this.stageInVfs(op);
            
            // 📝 Update Journal to APPLIED
            entry.status = 'APPLIED';
            await fs.appendFile(this.journalPath, JSON.stringify(entry) + '\n');
            
            // 📝 Update Lineage Immediately
            await this.updateLineage(op);
            console.error(`[TRACE:CLIENT:stream-materializer] Applied operation ${op.sequence}: ${op.path} (${op.type})`);

            this.lastSequence = op.sequence;

            TelemetryEmitter.emit({
                event: PlanStreamEvent.OPERATION_APPLIED,
                eventType: 'OPERATION_APPLIED',
                eventCategory: 'materializer',
                planId: this.planId,
                metadata: { operationId: op.operationId, path: op.path, sequence: op.sequence }
            });

        } catch (err: any) {
            entry.status = 'FAILED';
            await fs.appendFile(this.journalPath, JSON.stringify(entry) + '\n');
            throw err;
        }
    }

    async resume(planId: string, lastClientSequence: number): Promise<{ lastSequence: number }> {
        if (this.planId && this.planId !== planId) {
             throw new Error(`RESUME_FAILED: Plan mismatch.`);
        }
        
        this.planId = planId;
        const matDir = path.join(this.outDir, '.archon', 'materializations', this.planId);
        this.journalPath = path.join(matDir, 'journal.jsonl');

        if (!await fs.pathExists(this.journalPath)) {
            return { lastSequence: 0 };
        }

        const journal = await this.readJournal();
        const hasCommit = journal.some(j => j.status === 'COMMITTED');
        if (hasCommit) {
            throw new Error(`RESUME_REJECTED: Plan ${planId} is already committed.`);
        }

        const appliedOps = journal.filter(j => j.status === 'APPLIED');
        this.lastSequence = appliedOps.length > 0 ? Math.max(...appliedOps.map(j => j.sequence)) : 0;
        
        // 🧪 TODO: In a production environment, if the server process crashed, 
        // we might need to re-stage from a persistent cache or ask for full replay.
        // For now, we assume the server instance is persistent during connection drops.
        
        return { lastSequence: this.lastSequence };
    }

    async commit(): Promise<void> {
        if (!this.planId) throw new Error("No active materialization");

        try {
            // 📝 Atomic Commit Marker
            const commitEntry: StreamJournalEntry = {
                operationId: 'COMMIT',
                sequence: this.lastSequence + 1,
                path: '',
                afterHash: '',
                status: 'COMMITTED',
                timestamp: new Date().toISOString()
            };
            await fs.appendFile(this.journalPath, JSON.stringify(commitEntry) + '\n');

            console.error(`[TRACE:CLIENT:stream-materializer] Committing VFS to disk for plan ${this.planId}`);
            await this.vfs.commit();
            
            // Finalize Archon State
            const currentState = await this.stateManager.load();
            const finalState: ArchonState = {
                ...currentState,
                lastAppliedAt: new Date().toISOString(),
                appliedPlans: [{
                    planId: this.planId,
                    traceId: this.externalTraceId || 'unknown',
                    appliedAt: new Date().toISOString(),
                    planSchemaVersion: '1.1.0',
                    engineVersion: '1.0.0',
                    fingerprint: 'streamed'
                }, ...currentState.appliedPlans].slice(0, 50)
            };
            await this.stateManager.save(finalState);

            TelemetryEmitter.emit({
                event: PlanStreamEvent.COMMITTED,
                eventType: 'MATERIALIZATION_COMPLETED',
                eventCategory: 'materializer',
                planId: this.planId,
                status: 'SUCCESS'
            });

            // 🔓 Release Lock
            await this.releaseLock();

        } catch (err: any) {
            throw new Error(`COMMIT_FAILED: ${err.message}`);
        }
    }

    async abort(reason: string): Promise<void> {
        logger.error({ planId: this.planId, reason }, "Aborting materialization stream");
        // Rollback VFS staged changes (memory only)
        this.vfs = new VirtualTree(this.outDir); 
        
        await this.releaseLock();

        TelemetryEmitter.emit({
            event: PlanStreamEvent.ABORTED,
            eventType: 'MATERIALIZATION_ABORTED',
            eventCategory: 'materializer',
            planId: this.planId,
            metadata: { reason }
        });
    }

    async getFingerprint(): Promise<string> {
        const state = await this.stateManager.load();
        return StateManager.calculateFingerprint(state);
    }

    async getStatus() {
        const journal = await this.readJournal();
        const applied = journal.filter(j => j.status === 'APPLIED');
        return {
            planId: this.planId,
            lastSequence: this.lastSequence,
            appliedCount: applied.length,
            journalEntries: journal.length,
            state: this.planId ? 'ACTIVE' : 'IDLE'
        };
    }

    public async readJournal(): Promise<StreamJournalEntry[]> {
        if (!this.journalPath || !await fs.pathExists(this.journalPath)) return [];
        const content = await fs.readFile(this.journalPath, 'utf8');
        return content.split('\n').filter(l => !!l).map(l => JSON.parse(l));
    }

    private async stageInVfs(op: StreamedExecutionOperation): Promise<void> {
        if (op.type === 'create' || op.type === 'update') {
            this.vfs.write(op.path, op.content || '');
        } else if (op.type === 'delete') {
            this.vfs.delete(op.path);
        }
    }

    private async acquireLock(planId: string): Promise<void> {
        await fs.ensureDir(path.dirname(this.lockPath));
        if (await fs.pathExists(this.lockPath)) {
            const lockData = await fs.readJson(this.lockPath);
            if (lockData.planId !== planId) {
                throw new Error(`LOCK_ACQUISITION_FAILED: Workspace is locked by another session (${lockData.planId})`);
            }
        }
        await fs.writeJson(this.lockPath, { planId, acquiredAt: new Date().toISOString() });
    }

    private async releaseLock(): Promise<void> {
        if (await fs.pathExists(this.lockPath)) {
            await fs.remove(this.lockPath);
        }
    }

    private async updateLineage(op: StreamedExecutionOperation): Promise<void> {
        await this.lineageManager.record(op);
    }
}
