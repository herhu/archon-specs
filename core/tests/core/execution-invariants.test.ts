import { describe, it, expect } from "vitest";
import { ChangePlanner, ArtifactRef } from "../../src/core/change-planner.js";

describe("Execution Invariants", () => {
    it("should deduplicate identical artifacts", () => {
        const raw: ArtifactRef[] = [
            { kind: "platform-root" },
            { kind: "platform-root" },
            { kind: "entity", domain: "billing", entity: "Invoice" }
        ];
        
        const normalized = (ChangePlanner as any).normalizeArtifacts(raw);
        expect(normalized.filter((a: any) => a.kind === "platform-root").length).toBe(1);
        expect(normalized.length).toBe(2);
    });

    it("should subsume granular artifacts into domain-root", () => {
        const raw: ArtifactRef[] = [
            { kind: "domain-root", domain: "billing" },
            { kind: "entity", domain: "billing", entity: "Invoice" },
            { kind: "dto", domain: "billing", entity: "Invoice" },
            { kind: "domain-module", domain: "billing" },
            { kind: "auth-root" }
        ];

        const normalized = (ChangePlanner as any).normalizeArtifacts(raw);
        
        // Should only have domain-root for billing
        expect(normalized.find((a: any) => a.kind === "domain-root" && a.domain === "billing")).toBeDefined();
        expect(normalized.find((a: any) => a.kind === "entity" && a.domain === "billing")).toBeUndefined();
        expect(normalized.find((a: any) => a.kind === "dto" && a.domain === "billing")).toBeUndefined();
        expect(normalized.find((a: any) => a.kind === "domain-module" && a.domain === "billing")).toBeUndefined();
        expect(normalized.find((a: any) => a.kind === "auth-root")).toBeDefined();
    });

    it("should enforce deterministic execution order", () => {
        const raw: ArtifactRef[] = [
            { kind: "lineage-root" },
            { kind: "auth-root" },
            { kind: "scaffold-root" },
            { kind: "entity", domain: "billing", entity: "Invoice" },
            { kind: "platform-root" }
        ];

        const normalized = (ChangePlanner as any).normalizeArtifacts(raw);
        
        const kinds = normalized.map((a: any) => a.kind);
        // Order: scaffold (1), auth (3), entity (12), platform (20), lineage (50)
        expect(kinds).toEqual(["scaffold-root", "auth-root", "entity", "platform-root", "lineage-root"]);
    });

    it("should keep unrelated domains separate", () => {
        const raw: ArtifactRef[] = [
            { kind: "domain-root", domain: "billing" },
            { kind: "entity", domain: "shipping", entity: "Shipment" }
        ];

        const normalized = (ChangePlanner as any).normalizeArtifacts(raw);
        expect(normalized.length).toBe(2);
        expect(normalized.find((a: any) => a.domain === "billing")).toBeDefined();
        expect(normalized.find((a: any) => a.domain === "shipping")).toBeDefined();
    });
});
