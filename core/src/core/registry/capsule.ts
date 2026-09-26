export type SymbolKind = "module" | "service" | "controller" | "dto" | "entity" | "interface" | "schema" | "port";

export interface SymbolExport {
    name: string;
    kind: SymbolKind;
    path: string; // Internal path within the capsule artifacts
}

export interface SymbolImport {
    name: string;
    kind: SymbolKind;
    source?: string; // Optional: specify capsuleId or "external"
}

export interface SemanticBinding {
    type: "bind-symbol" | "register-provider" | "inject-middleware" | "merge-config";
    targetSlot: string; // e.g. "nestjs:AppModule.imports"
    value: any; // The symbol name or raw configuration
}

export interface ScaffoldOp {
    kind: "file" | "template";
    targetPath: string;
    sourcePath?: string; // For templates
    content?: string; // For literal files
    context?: Record<string, any>;
}

export interface SpecCapsule {
    capsuleId: string;
    version: string;
    kind: "domain-module" | "infra-module" | "cross-cutting" | "platform";
    exports: SymbolExport[];
    imports: SymbolImport[];
    bindings: SemanticBinding[];
    intent: {
        domains?: any[];
        modules?: any[];
        platform?: any[];
    };
    targets: string[]; // Glob patterns of files this capsule manages
}

export interface InjectionPack {
    capsuleId: string;
    exports: SymbolExport[];
    imports: SymbolImport[];
    scaffoldOps: ScaffoldOp[];
    bindings: SemanticBinding[];
    metadata: {
        compiledAt: string;
        generatorVersion: string;
    };
}

export interface CapsuleResolver {
    resolve(capsuleId: string): Promise<SpecCapsule | undefined>;
    resolvePack(capsuleId: string): Promise<InjectionPack | undefined>;
}
