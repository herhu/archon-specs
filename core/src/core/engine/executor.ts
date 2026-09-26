import * as fs from 'fs-extra';
import * as path from 'path';
import { ChangeOperation, ExecutionResult } from './change-operation';
import { VirtualTree } from '../vfs/vfs';
import { AstEditor } from '../vfs/ast-editor';
import { JsonEditor } from '../vfs/json-editor';
import { logger } from '../telemetry/logger';

import { ArchonState, OwnershipClass, OwnershipEntry, StateManager } from '../state/state-manager';

export type ExecutionStrategy = "fail-fast" | "collect-errors";

export class Executor {
    private astEditor: AstEditor;
    private jsonEditor: JsonEditor;

    constructor(private readonly tree: VirtualTree) {
        this.astEditor = new AstEditor(tree);
        this.jsonEditor = new JsonEditor(tree);
    }

    async execute(operations: ChangeOperation[], strategy: ExecutionStrategy = "fail-fast"): Promise<ExecutionResult[]> {
        const results: ExecutionResult[] = [];
        logger.info({ opCount: operations.length, strategy }, "Executing change operations");

        const { TelemetryEmitter } = await import("../telemetry/telemetry");
        const { TraceManager } = await import("../telemetry/trace-context");
        const startTime = Date.now();

        TelemetryEmitter.emit({
            event: 'EXECUTION_STARTED',
            eventType: 'EXECUTION_STARTED',
            eventCategory: 'orchestrator',
            operation: 'executor_run',
            metadata: { opCount: operations.length, strategy }
        });

        for (const op of operations) {
            const opStartTime = Date.now();
            let success = false;
            let warning: string | undefined;

            try {
                const res = await this.applyOperation(op);
                success = true;
                if (!res.changed) {
                    warning = res.reason || "no-op";
                }
            } catch (err: any) {
                const errorCtx = `[Capsule: ${op.capsuleId}] [Op: ${op.kind}] [Target: ${op.target}] [Error: ${err.message}]`;
                logger.error({ opId: op.id, error: errorCtx }, "Operation failed");
                
                results.push({
                    operationId: op.id,
                    success: false,
                    error: errorCtx,
                    durationMs: Date.now() - opStartTime
                });

                if (strategy === "fail-fast") {
                    logger.warn("Fail-Fast strategy active. Aborting remaining operations.");
                    break; 
                }
                continue;
            }

            results.push({
                operationId: op.id,
                success: true,
                warning,
                durationMs: Date.now() - opStartTime
            });
        }

        TelemetryEmitter.emit({
            event: 'EXECUTION_COMPLETED',
            eventType: 'EXECUTION_COMPLETED',
            eventCategory: 'orchestrator',
            operation: 'executor_run',
            status: 'SUCCESS',
            durationMs: Date.now() - startTime,
            metadata: { 
                successCount: results.filter(r => r.success).length,
                failCount: results.filter(r => !r.success).length
            }
        });

        return results;
    }

    /**
     * Captures a snapshot of the applied intent for state persistence.
     * This should be called after a successful VFS commit.
     */
    async captureSnapshot(operations: ChangeOperation[], results: ExecutionResult[]): Promise<Partial<ArchonState>> {
        const { HashUtil } = await import("../utils/hash-util");
        const artifacts: Record<string, OwnershipEntry> = {};
        const successOps = results.filter(r => r.success).map(r => r.operationId);

        // 1. Process explicit operations (highest precision ownership)
        for (const op of operations) {
            if (!successOps.includes(op.id)) continue;

            const entry = this.tree.get(op.target);
            if (!entry || entry.status === 'deleted') continue;

            let ownership: OwnershipClass = "managed";
            if (op.slotId) {
                ownership = "shared";
            }

            const content = entry.nextContent || entry.originalContent || "";
            artifacts[op.target] = {
                path: op.target,
                hash: HashUtil.calculateHash(content),
                maskedHash: HashUtil.calculateMaskedHash(op.target, content),
                ownership,
                capsuleId: op.capsuleId,
                semanticKey: op.semanticKey
            };
        }

        // 2. Discover artifacts that were changed/touched but NOT tracked via operations (Fallback)
        const touchedPaths = this.tree.listTouchedPaths();
        console.error(`[SNAPSHOT] Found ${touchedPaths.length} touched paths from VFS`);
        
        for (const fullPath of touchedPaths) {
            if (artifacts[fullPath]) continue; 

            const entry = this.tree.get(fullPath);
            if (entry && entry.nextContent !== undefined) {
                console.error(`[SNAPSHOT] Recording fallback artifact: ${fullPath}`);
                artifacts[fullPath] = {
                    path: fullPath,
                    hash: HashUtil.calculateHash(entry.nextContent),
                    maskedHash: HashUtil.calculateMaskedHash(fullPath, entry.nextContent),
                    ownership: "managed",
                    capsuleId: "orchestrator.base"
                };
            }
        }

        return {
            lastAppliedAt: new Date().toISOString(),
            ownedArtifacts: artifacts
        };
    }

    private async applyOperation(op: ChangeOperation): Promise<{ changed: boolean, reason?: string }> {
        switch (op.kind) {
            case "create-file":
                let content = op.payload.content;
                if (content === undefined && op.payload.sourcePath) {
                    const templateRelPath = op.payload.sourcePath;
                    
                    // --- Dynamic Template Discovery ---
                    let templatesDir = path.join(__dirname, "../../templates"); // Dist mode
                    if (!fs.existsSync(templatesDir)) {
                        templatesDir = path.join(__dirname, "../../../src/templates"); // Source mode
                    }
                    if (!fs.existsSync(templatesDir)) {
                        templatesDir = path.join(process.cwd(), "templates"); // Legacy Fallback
                    }

                    const templatePath = path.resolve(templatesDir, templateRelPath); 
                    logger.info({ templatePath, target: op.target, templatesDir }, "Resolving template for create-file");
                    
                    if (await fs.pathExists(templatePath)) {
                        const templateSource = await fs.readFile(templatePath, 'utf-8');
                        const { templateEngine } = await import("../vfs/template-engine");
                        content = templateEngine.render(templateSource, op.payload.context);
                    } else {
                        logger.error({ templatePath }, "Template file missing");
                        throw new Error(`Template not found: ${templatePath}`);
                    }
                }

                const existing = await this.tree.read(op.target);
                if (existing === content) {
                    logger.debug({ target: op.target }, "Skipping create-file: identical content already exists");
                    return { changed: false, reason: "equivalent-file-exists" };
                }
                
                await this.tree.write(op.target, content || "");
                logger.debug({ target: op.target, contentLength: content?.length }, "Staged file creation");
                return { changed: true };

            case "ensure-import":
                return await this.astEditor.ensureImport(op.target, op.payload.from, [op.payload.symbol]);

            case "update-slot":
                return await this.handleSlotUpdate(op);

            case "merge-json":
                return await this.jsonEditor.merge(op.target, op.payload);

            default:
                return { changed: false, reason: `unsupported-op-kind: ${op.kind}` };
        }
    }

    private async handleSlotUpdate(op: ChangeOperation): Promise<{ changed: boolean, reason?: string }> {
        const { slot, value } = op.payload;
        
        switch (slot.kind) {
            case "nestjs:module:imports":
                return await this.astEditor.ensureNestModuleImport(slot.targetFile, value.symbol, value.from || value.resolvedPath);
            
            case "package:dependencies":
                return await this.jsonEditor.merge(slot.targetFile, { dependencies: { [value.name]: value.version || "latest" } });

            default:
                return { changed: false, reason: `unsupported-slot-kind: ${slot.kind}` };
        }
    }
}
