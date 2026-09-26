import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../telemetry/logger';
import { PlannedChange, RuleResult } from '../../rules/rule-result';

export type FileStatus = "unchanged" | "created" | "updated" | "deleted";

export interface VirtualFileEntry {
  path: string;
  originalContent?: string;
  nextContent?: string;
  status: FileStatus;
  touched?: boolean; // Whether Archon explicitly managed/wrote this file
}

export interface ChangeSet {
  operations: Record<string, {
    type: OperationType;
    content?: string;
    hash: string;
  }>;
}

import { ExecutionPlan, ExecutionOperation, OperationType } from '../engine/execution-plan';
import { StateManager } from '../state/state-manager';
import { TelemetryEmitter } from '../telemetry/telemetry';

export class VirtualTree {
  private entries: Map<string, VirtualFileEntry> = new Map();
  private onOperationReady?: (op: ExecutionOperation) => void;

  constructor(private readonly basePath: string = process.cwd()) { }

  setOperationCallback(cb: (op: ExecutionOperation) => void) {
    this.onOperationReady = cb;
  }

  get(filePath: string | undefined): VirtualFileEntry | undefined {
    if (!filePath) return undefined;
    const fullPath = this.resolvePath(filePath);
    return this.entries.get(fullPath);
  }

  invalidate(filePath: string): void {
    const fullPath = this.resolvePath(filePath);
    this.entries.delete(fullPath);
  }

  async read(filePath: string): Promise<string | undefined> {
    const fullPath = this.resolvePath(filePath);

    if (this.entries.has(fullPath)) {
      const entry = this.entries.get(fullPath)!;
      if (entry.status === 'deleted') return undefined;
      return entry.nextContent;
    }

    try {
      if (await fs.pathExists(fullPath)) {
        const content = await fs.readFile(fullPath, 'utf-8');
        this.entries.set(fullPath, {
          path: fullPath,
          originalContent: content,
          nextContent: content,
          status: 'unchanged'
        });
        return content;
      }
    } catch (err) {
      // Ignore read errors
    }

    return undefined;
  }

  async touch(filePath: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    await this.read(fullPath); // Ensure entry exists in memory
    const entry = this.entries.get(fullPath);
    if (entry) {
      entry.touched = true;
    }
  }

  async write(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    const existingContent = await this.read(fullPath);

    if (existingContent === content) {
      const entry = this.entries.get(fullPath);
      if (entry) {
        entry.touched = true;
        if (entry.status === 'unchanged') return;
      }
    }

    let status: FileStatus = 'updated';
    const entry = this.entries.get(fullPath);
    if (!entry || entry.originalContent === undefined) {
      status = 'created';
    } else if (entry.originalContent === content) {
      status = 'unchanged';
    }

    this.entries.set(fullPath, {
      path: fullPath,
      originalContent: entry?.originalContent,
      nextContent: content,
      status,
      touched: true
    });
  }

  async delete(filePath: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    const entry = this.entries.get(fullPath);

    if (entry) {
      entry.nextContent = undefined;
      entry.status = 'deleted';
    } else {
      if (await fs.pathExists(fullPath)) {
        const content = await fs.readFile(fullPath, 'utf-8');
        this.entries.set(fullPath, {
          path: fullPath,
          originalContent: content,
          nextContent: undefined,
          status: 'deleted'
        });
      }
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const content = await this.read(filePath);
    return content !== undefined;
  }

  listChanges(): PlannedChange[] {
    const changes: PlannedChange[] = [];

    for (const [fullPath, entry] of this.entries.entries()) {
      if (entry.status === 'unchanged') continue;

      const relPath = path.relative(this.basePath, fullPath);

      let type: "create" | "update" | "delete" = "update";
      let summary = "";

      if (entry.status === 'created') {
        type = 'create';
        summary = `Create file ${relPath}`;
      } else if (entry.status === 'deleted') {
        type = 'delete';
        summary = `Delete file ${relPath}`;
      } else if (entry.status === 'updated') {
        type = 'update';
        summary = `Update file ${relPath}`;
      }

      changes.push({
        type,
        path: relPath,
        summary
      });
    }

    return changes;
  }

  listTouchedPaths(): string[] {
    const paths: string[] = [];
    for (const [fullPath, entry] of this.entries.entries()) {
      if (entry.touched && entry.status !== 'deleted') {
        paths.push(fullPath);
      }
    }
    return paths;
  }

  /**
   * Generates a structural fingerprint of the current tree state.
   * Useful for base-state compatibility checks.
   */
  async calculateFingerprint(): Promise<string> {
    const paths = Array.from(this.entries.keys()).sort();
    let combined = "";
    for (const p of paths) {
      const entry = this.entries.get(p)!;
      if (entry.status === 'deleted') continue;

      const relPath = path.relative(this.basePath, p);
      // Canonicalization: Normalize line endings before hashing for cross-platform bit-identity
      const content = (entry.nextContent || "").replace(/\r\n/g, '\n').trim();
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      combined += `${relPath}:${hash}|`;
    }
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Serializes current staged changes into an ExecutionOperation array.
   */
  serializeOperations(results: RuleResult[]): ExecutionOperation[] {
    const ops: ExecutionOperation[] = [];

    for (const [fullPath, entry] of this.entries.entries()) {
      if (entry.status === 'unchanged') continue;

      const relPath = path.relative(this.basePath, fullPath);
      const res = results.find(r => r.changes.some(c => c.path === relPath));

      const type: OperationType = entry.status === 'created' ? 'create' : (entry.status === 'deleted' ? 'delete' : 'update');
      const content = entry.nextContent;

      const op: ExecutionOperation = {
        id: `op_${Math.random().toString(36).substring(2, 9)}`,
        type,
        path: relPath,
        capsuleId: res?.ruleId || 'manual',
        ownership: 'managed', // default
        summary: `Archon Operation: ${type} ${relPath}`,
        content: (content && content.length < 100000) ? content : undefined, // Inline if < 100KB
        blobRef: (content && content.length >= 100000) ? {
          provider: 's3',
          url: 'pending', // To be filled by remote tool
          hash: crypto.createHash('sha256').update(content).digest('hex')
        } : undefined,
        fingerprint: content ? crypto.createHash('sha256').update(content).digest('hex') : ''
      };

      if (this.onOperationReady) {
        this.onOperationReady(op);
      }

      ops.push(op);
    }

    // --- Hardened Phase 3.2: Deterministic Operation Sorting ---
    // Enforce bit-identical stability across re-runs.
    ops.sort((a, b) => {
      const pathComp = (a.path || "").localeCompare(b.path || "");
      if (pathComp !== 0) return pathComp;
      return (a.type || "").localeCompare(b.type || "");
    });

    return ops;
  }

  /**
   * Applies an external ExecutionPlan to the current virtual tree.
   * Pre-commit validation happens later in vfs.commit().
   */
  async applyPlan(plan: ExecutionPlan): Promise<void> {
    for (const op of plan.operations) {
      const fullPath = this.resolvePath(op.path);

      if (op.type === 'delete') {
        await this.delete(op.path);
      } else {
        let content = op.content;
        if (!content && op.blobRef) {
          // In a real implementation, we would fetch from S3 here if needed,
          // or the caller (MCP tool) would have pre-fetched it.
          throw new Error(`Blob content not provided for ${op.path}. Fetching not implemented in VFS core.`);
        }

        if (content !== undefined) {
          await this.write(op.path, content);
          const entry = this.entries.get(fullPath);
          if (entry) {
            entry.touched = true;
          }
        }
      }
    }
  }

  async commit(): Promise<void> {
    const stagedCount = Array.from(this.entries.values()).filter(e => e.status !== 'unchanged').length;
    logger.info({ stagedChanges: stagedCount }, "Attempting atomic commit");

    TelemetryEmitter.emit({
      event: 'VFS_COMMIT_STARTED',
      eventType: 'VFS_COMMIT_STARTED',
      eventCategory: 'filesystem',
      operation: 'vfs_commit',
      metadata: { stagedCount }
    });

    // Stage 5 Validation Gate (Post-Materialization)
    try {
      await this.validateChanges();
    } catch (err: any) {
      logger.error({ error: err.message }, "Staging Validation Failed. Initiating Transaction Rollback.");
      this.rollback();
      throw err; // Re-throw to inform the executor/caller
    }

    for (const [fullPath, entry] of this.entries.entries()) {
      if (entry.status === 'unchanged') continue;

      if (entry.status === 'deleted') {
        if (await fs.pathExists(fullPath)) {
          await fs.unlink(fullPath);
        }
      } else if ((entry.status === 'created' || entry.status === 'updated') && entry.nextContent !== undefined) {
        await fs.ensureDir(path.dirname(fullPath));
        const tempPath = `${fullPath}.tmp.${Math.random().toString(36).substring(2, 9)}`;
        try {
          await fs.writeFile(tempPath, entry.nextContent, 'utf-8');
          // Atomic Rename
          await fs.rename(tempPath, fullPath);
        } catch (err: any) {
          if (await fs.pathExists(tempPath)) await fs.remove(tempPath);
          throw err;
        }
      }

      // Update entry state post-commit
      if (entry.status !== 'deleted') {
        entry.originalContent = entry.nextContent;
        entry.status = 'unchanged';
      }
    }

    // Cleanup deleted entries from memory
    for (const [fullPath, entry] of this.entries.entries()) {
      if (entry.status === 'deleted') {
        this.entries.delete(fullPath);
      }
    }
    logger.info("Atomic commit successful");
    TelemetryEmitter.emit({
      event: 'VFS_COMMIT_COMPLETED',
      eventType: 'VFS_COMMIT_COMPLETED',
      eventCategory: 'filesystem',
      operation: 'vfs_commit',
      status: 'SUCCESS',
      metadata: { stagedCount }
    });
  }

  rollback(): void {
    logger.info("Discarding staged changes (Rollback)");
    for (const entry of this.entries.values()) {
      entry.nextContent = entry.originalContent;
      if (entry.status === 'created') {
        entry.status = 'deleted'; // It was never on disk
      } else {
        entry.status = 'unchanged';
      }
    }
  }

  private async validateChanges(): Promise<void> {
    for (const entry of this.entries.values()) {
      if (entry.status === 'deleted' || entry.status === 'unchanged') continue;
      if (entry.nextContent === undefined) continue;

      const ext = path.extname(entry.path);
      if (ext === '.json') {
        try {
          JSON.parse(entry.nextContent);
        } catch (err: any) {
          throw new Error(`Syntax Validation Failed! [${entry.path}] is malformed JSON: ${err.message}`);
        }
      }

      if (ext === '.ts') {
        // Minimal TS syntactic check (Ensuring basic structure isn't destroyed)
        if (entry.nextContent.length > 0 && !entry.nextContent.includes('export') && !entry.nextContent.includes('import') && !entry.nextContent.includes('class')) {
          // Potential destructive edit detected
          logger.warn({ path: entry.path }, "Suspiciously empty TypeScript file following mutation");
        }
      }
    }
  }

  private resolvePath(filePath: string): string {
    const res = path.isAbsolute(filePath) ? filePath : path.resolve(this.basePath, filePath);
    // console.error(`[VFS] Resolve: ${filePath} -> ${res}`);
    return res;
  }

  // Clone for overlays
  clone(): VirtualTree {
    const newTree = new VirtualTree(this.basePath);
    for (const [key, value] of this.entries.entries()) {
      newTree.entries.set(key, { ...value });
    }
    return newTree;
  }
}

export interface OverlayLayer {
  id: string;
  capsuleId: string;
  operations: any[]; // ChangeOperation[] 
}

export interface Conflict {
  path: string;
  capsuleIds: string[];
  type: "content" | "delete-collision" | "create-collision";
}

export class OverlayWorkspace {
  private layers: Map<string, OverlayLayer> = new Map();

  constructor(private readonly base: VirtualTree) { }

  addLayer(layer: OverlayLayer) {
    this.layers.set(layer.id, layer);
  }

  async materialize(): Promise<VirtualTree> {
    const result = this.base.clone();

    // In Stage 2, we just apply layers sequentially. 
    // Later we can add conflict detection and graph resolution.
    for (const layer of this.layers.values()) {
      // Logic for applying operations will be handled by ExecutionPlan or a separate Applicator
    }

    return result;
  }
}
