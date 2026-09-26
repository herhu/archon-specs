import { InjectionPack, SemanticBinding, SymbolImport, SymbolExport } from './capsule';
import { slotRegistry, InjectionSlot } from './slot-registry';
import { logger } from '../telemetry/logger';

export interface ResolvedBinding {
    slot: InjectionSlot;
    operation: "add" | "merge" | "replace";
    value: any;
    capsuleId: string;
}

export class SemanticLinker {
    private symbolRegistry: Map<string, { capsuleId: string; export: SymbolExport }> = new Map();

    registerExports(pack: InjectionPack) {
        for (const exp of pack.exports) {
            const key = `${exp.kind}:${exp.name}`;
            if (this.symbolRegistry.has(key)) {
                logger.warn({ symbol: exp.name, existingCapsule: this.symbolRegistry.get(key)!.capsuleId, newCapsule: pack.capsuleId }, "Symbol Collision Detected during registration");
            }
            this.symbolRegistry.set(key, { capsuleId: pack.capsuleId, export: exp });
        }
    }

    async link(packs: InjectionPack[]): Promise<ResolvedBinding[]> {
        logger.info({ packCount: packs.length }, "Linking injection packs");

        // 1. Register all exports first (Indexed lookup setup)
        for (const pack of packs) {
            this.registerExports(pack);
        }

        const resolvedBindings: ResolvedBinding[] = [];
        const slotGroups: Map<string, ResolvedBinding[]> = new Map();

        // 2. Resolve and Group Bindings by Slot
        for (const pack of packs) {
            for (const binding of pack.bindings) {
                const slot = slotRegistry.get(binding.targetSlot);
                if (!slot) {
                    logger.warn({ slotId: binding.targetSlot, capsuleId: pack.capsuleId }, "Unrecognized injection slot");
                    continue;
                }

                const resolvedValue = this.resolveValue(binding.value, pack);
                const currentBindings = slotGroups.get(slot.id) || [];

                // Deduplication based on Slot Policy
                let isDuplicate = false;
                if (slot.dedupeStrategy === "by-symbol" && resolvedValue.symbol) {
                    isDuplicate = currentBindings.some(b => b.value.symbol === resolvedValue.symbol);
                } else if (slot.dedupeStrategy === "by-name" && resolvedValue.name) {
                    isDuplicate = currentBindings.some(b => b.value.name === resolvedValue.name);
                } else if (slot.dedupeStrategy === "by-value") {
                    isDuplicate = currentBindings.some(b => JSON.stringify(b.value) === JSON.stringify(resolvedValue));
                }

                if (isDuplicate) {
                    logger.info({ slotId: slot.id, capsuleId: pack.capsuleId }, "Skipping duplicate binding (Policy-Layer Idempotency)");
                    continue;
                }

                currentBindings.push({
                    slot,
                    operation: "add",
                    value: resolvedValue,
                    capsuleId: pack.capsuleId
                });
                slotGroups.set(slot.id, currentBindings);
            }
        }

        // 3. Apply Sorting and Flatten Groups
        for (const [slotId, bindings] of slotGroups.entries()) {
            const slot = slotRegistry.get(slotId)!;
            
            if (slot.sortStrategy === "alphabetical") {
                bindings.sort((a, b) => {
                    const valA = a.value.symbol || a.value.name || JSON.stringify(a.value) || "";
                    const valB = b.value.symbol || b.value.name || JSON.stringify(b.value) || "";
                    return (valA || "").localeCompare(valB || "");
                });
            }
            // "preserve-order" is implicit from push order of packs

            resolvedBindings.push(...bindings);
        }

        return resolvedBindings;
    }

    private resolveValue(value: any, pack: InjectionPack): any {
        // If the value is a reference to a symbol, resolve its path
        if (typeof value === "object" && value.symbol) {
            const key = `${value.kind || "module"}:${value.symbol}`;
            const found = this.symbolRegistry.get(key);
            
            if (found) {
                return {
                    ...value,
                    resolvedPath: found.export.path,
                    resolvedCapsule: found.capsuleId
                };
            }
        }
        return value;
    }
}
