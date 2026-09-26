import { Conflict } from '../vfs/vfs';
import { ChangeOperation } from '../engine/change-operation';
import { logger } from '../telemetry/logger';

export class ConflictDetector {
    detect(operations: ChangeOperation[]): Conflict[] {
        const conflicts: Conflict[] = [];
        const seenSlots: Map<string, { capsuleId: string, payload: any }[]> = new Map();
        const seenExports: Map<string, string[]> = new Map();
        const seenFiles: Map<string, string[]> = new Map();

        for (const op of operations) {
            // 1. Symbol Export Conflicts
            if (op.kind === "create-file" && op.payload?.context?.moduleClassName) {
                const className = op.payload.context.moduleClassName;
                const existing = seenExports.get(className) || [];
                if (existing.length > 0 && !existing.includes(op.capsuleId)) {
                    conflicts.push({
                        path: `Symbol:${className}`,
                        capsuleIds: [...existing, op.capsuleId],
                        type: "content"
                    });
                }
                seenExports.set(className, [...existing, op.capsuleId]);
            }

            // 2. Slot Conflicts & Cardinality
            if (op.kind === "update-slot") {
                const slotId = op.target;
                const existing = seenSlots.get(slotId) || [];
                const slot = op.payload.slot;

                if (slot.cardinality === "one" && existing.length > 0) {
                     // Check if it's a different value or just a duplicate from another capsule
                     const isDuplicateValue = existing.some(e => JSON.stringify(e.payload.value) === JSON.stringify(op.payload.value));
                     if (!isDuplicateValue) {
                        conflicts.push({
                            path: slotId,
                            capsuleIds: [...existing.map(e => e.capsuleId), op.capsuleId],
                            type: "content"
                        });
                     }
                }

                // Sub-region detection would go here for complex files

                seenSlots.set(slotId, [...existing, { capsuleId: op.capsuleId, payload: op.payload }]);
            }

            // 3. File Creation Conflicts
            if (op.kind === "create-file" || op.kind === "delete-file") {
                const existing = seenFiles.get(op.target) || [];
                if (existing.length > 0 && !existing.includes(op.capsuleId)) {
                    conflicts.push({
                        path: op.target,
                        capsuleIds: [...existing, op.capsuleId],
                        type: op.kind === "create-file" ? "create-collision" : "delete-collision"
                    });
                }
                seenFiles.set(op.target, [...existing, op.capsuleId]);
            }
        }

        return conflicts;
    }
}
