import * as path from 'path';

export type SlotKind = 
    | "nestjs:module:imports" 
    | "nestjs:module:providers" 
    | "nestjs:module:controllers"
    | "package:dependencies" 
    | "package:scripts"
    | "json:merge"
    | "file:append";

export type SlotCardinality = "one" | "many";
export type ConflictStrategy = "error" | "merge" | "override";
export type DedupeStrategy = "by-value" | "by-symbol" | "by-name" | "none";
export type SortStrategy = "alphabetical" | "preserve-order" | "none";

export interface InjectionSlot {
    id: string;
    kind: SlotKind;
    targetFile: string;
    description?: string;
    cardinality: SlotCardinality;
    acceptedKind?: string | string[];
    conflictStrategy: ConflictStrategy;
    dedupeStrategy: DedupeStrategy;
    sortStrategy: SortStrategy;
    dedupeKey?: string; // Legacy: will be superseded by dedupeStrategy
}

export class SlotRegistry {
    private slots: Map<string, InjectionSlot> = new Map();

    constructor() {
        this.registerDefaultSlots();
    }

    register(slot: InjectionSlot) {
        this.slots.set(slot.id, slot);
    }

    get(id: string): InjectionSlot | undefined {
        return this.slots.get(id);
    }

    getAll(): InjectionSlot[] {
        return Array.from(this.slots.values());
    }

    private registerDefaultSlots() {
        // App Core
        this.register({
            id: "nestjs:AppModule.imports",
            kind: "nestjs:module:imports",
            targetFile: "src/app.module.ts",
            description: "Main NestJS application module imports",
            cardinality: "many",
            acceptedKind: "module",
            conflictStrategy: "merge",
            dedupeStrategy: "by-symbol",
            sortStrategy: "alphabetical"
        });

        this.register({
            id: "package.json.dependencies",
            kind: "package:dependencies",
            targetFile: "package.json",
            description: "NPM package dependencies",
            cardinality: "many",
            conflictStrategy: "merge",
            dedupeStrategy: "by-name",
            sortStrategy: "alphabetical"
        });

        this.register({
            id: "package.json.scripts",
            kind: "package:scripts",
            targetFile: "package.json",
            description: "NPM package scripts",
            cardinality: "many",
            conflictStrategy: "merge",
            dedupeStrategy: "by-name",
            sortStrategy: "alphabetical"
        });

        // Infrastructure
        this.register({
            id: "terraform:main.providers",
            kind: "json:merge",
            targetFile: "infrastructure/main.tf",
            description: "Terraform providers",
            cardinality: "many",
            conflictStrategy: "merge",
            dedupeStrategy: "by-value",
            sortStrategy: "preserve-order"
        });
    }
}

export const slotRegistry = new SlotRegistry();
