import * as fs from 'fs-extra';
// Deprecated: Direct disk writes should be avoided in V2.
// Use VirtualTree (VFS) directly via ExecutionContext.

export interface WriteResult {
    path: string;
    status: 'created' | 'updated' | 'merged' | 'skipped';
    size: number;
    usedManualMerge: boolean;
}

export async function writeArtifact(filePath: string, content: string, dryRun?: boolean): Promise<any> {
    throw new Error('Direct IO writes are deprecated in Archon V2. Use ExecutionContext.vfs instead.');
}

export function loadSpec(filePath: string): any {
    return fs.readJSONSync(filePath);
}
