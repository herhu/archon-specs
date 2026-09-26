import * as fs from 'fs-extra';
import * as path from 'path';
import { StreamedExecutionOperation } from '../engine/execution-plan';

export interface LineageEntry {
    path: string;
    planId: string;
    lineageId: string;
    revisionId: string;
    operationId: string;
    capsuleId: string;
    beforeHash?: string;
    afterHash: string;
    appliedAt: string;
}

export class LineageManager {
    private lineagePath: string;

    constructor(private readonly workspaceDir: string, private readonly projectName?: string) {
        if (projectName) {
            this.lineagePath = path.join(workspaceDir, '.archon', 'projects', projectName, 'lineage.jsonl');
        } else {
            this.lineagePath = path.join(workspaceDir, '.archon', 'lineage.jsonl');
        }
    }


    async record(op: StreamedExecutionOperation): Promise<void> {
        const entry: any = {
            v: 1, // Lineage Schema Version
            path: op.path,
            planId: op.planId,
            lineageId: op.lineageId,
            revisionId: op.revisionId,
            operationId: op.operationId,
            capsuleId: op.capsuleId || 'unknown',
            beforeHash: op.beforeHash,
            afterHash: op.afterHash,
            appliedAt: new Date().toISOString()
        };

        await fs.ensureDir(path.dirname(this.lineagePath));
        await fs.appendFile(this.lineagePath, JSON.stringify(entry) + '\n');
    }

    async getLineage(filePath: string): Promise<LineageEntry[]> {
        if (!await fs.pathExists(this.lineagePath)) return [];
        const content = await fs.readFile(this.lineagePath, 'utf8');
        return content.split('\n')
            .filter(l => !!l)
            .map(l => JSON.parse(l))
            .filter((l: LineageEntry) => l.path === filePath);
    }
}
