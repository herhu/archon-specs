import { VirtualTree } from './vfs';
import * as fs from 'fs-extra';
import { logger } from '../telemetry/logger';

export class JsonEditor {
    constructor(private readonly vfs: VirtualTree) {}

    async merge(filePath: string, patch: any): Promise<{ changed: boolean, reason?: string }> {
        const content = await this.vfs.read(filePath);
        let current = {};
        
        if (content) {
            try {
                current = JSON.parse(content);
            } catch (err) {
                logger.warn({ filePath }, "Failed to parse JSON file for merging");
                return { changed: false, reason: "parse-error" };
            }
        }

        const { merged, changed } = this.deepMerge(current, patch);

        if (changed) {
            await this.vfs.write(filePath, JSON.stringify(merged, null, 2));
            return { changed: true };
        }

        return { changed: false, reason: "already-merged" };
    }

    private deepMerge(target: any, source: any): { merged: any, changed: boolean } {
        let changed = false;
        const result = { ...target };

        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                const val = source[key];
                if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                    const subRes = this.deepMerge(target[key] || {}, val);
                    result[key] = subRes.merged;
                    if (subRes.changed) changed = true;
                } else if (Array.isArray(val)) {
                    const targetArr = Array.isArray(target[key]) ? target[key] : [];
                    const newArr = [...targetArr];
                    for (const item of val) {
                        if (!newArr.some(existing => JSON.stringify(existing) === JSON.stringify(item))) {
                            newArr.push(item);
                            changed = true;
                        }
                    }
                    result[key] = newArr;
                } else {
                    if (target[key] !== val) {
                        result[key] = val;
                        changed = true;
                    }
                }
            }
        }

        return { merged: result, changed };
    }
}
