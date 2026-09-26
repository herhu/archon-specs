import { DesignSpec, Domain, Entity, Service } from '../state/spec';
import { SpecMutator } from '../state/spec-mutator';

export type TypedDelta =
  | { type: "DomainAdded"; domainKey: string }
  | { type: "DomainRemoved"; domainKey: string }
  | { type: "DomainRenamed"; oldKey: string; newKey: string }
  | { type: "DomainUpdated"; domainKey: string; changes: string[] }
  | { type: "EntityAdded"; domainKey: string; entityName: string }
  | { type: "EntityRemoved"; domainKey: string; entityName: string }
  | { type: "EntityUpdated"; domainKey: string; entityName: string }
  | { type: "ServiceAdded"; domainKey: string; serviceName: string }
  | { type: "ServiceRemoved"; domainKey: string; serviceName: string }
  | { type: "ServiceUpdated"; domainKey: string; serviceName: string }
  | { type: "PlatformChanged"; changes: string[] }
  | { type: "AuthChanged"; changes: string[] }
  | { type: "ModulesChanged"; changes: string[] }
  | { type: "DocsImpactOnly" }
  | { type: "GlobalFallbackRequired"; reason: string };

export type ArtifactRef =
  | { kind: "domain-module"; domain: string }
  | { kind: "domain-root"; domain: string } // NEW: Full domain regeneration
  | { kind: "entity"; domain: string; entity: string }
  | { kind: "dto"; domain: string; entity: string }
  | { kind: "service"; domain: string; service: string }
  | { kind: "controller"; domain: string; service: string }
  | { kind: "platform-root" }
  | { kind: "auth-root" }
  | { kind: "docs-root" }
  | { kind: "scripts-root" }
  | { kind: "readme-root" }
  | { kind: "docker-root" }
  | { kind: "scaffold-root" }
  | { kind: "lineage-root" }
  | { kind: "migration" };

export type ExecutionMode = "artifact" | "domain" | "full";

export interface ChangePlan {
  mode: ExecutionMode;
  deltas: TypedDelta[];
  artifacts: ArtifactRef[];
  reasons: string[];
}

export class ChangePlanner {
  static planChanges(oldSpec: DesignSpec | null, newSpec: DesignSpec): ChangePlan {
    if (!oldSpec) {
      return this.fullPlan("No previous spec provided");
    }

    const plan: ChangePlan = {
      mode: "artifact",
      deltas: [],
      artifacts: [],
      reasons: [],
    };

    // Normalize both specs for comparison
    const normOld = SpecMutator.normalizeSpec(oldSpec);
    const normNew = SpecMutator.normalizeSpec(newSpec);

    // 1. Check Platform
    if (JSON.stringify(normOld.platform) !== JSON.stringify(normNew.platform)) {
      plan.deltas.push({ type: "PlatformChanged", changes: ["platform config mismatch"] });
      plan.artifacts.push({ kind: "platform-root" });
      plan.artifacts.push({ kind: "docs-root" });
    }

    // 2. Check Auth
    if (JSON.stringify(normOld.crossCutting?.auth) !== JSON.stringify(normNew.crossCutting?.auth)) {
      plan.deltas.push({ type: "AuthChanged", changes: ["auth config mismatch"] });
      plan.artifacts.push({ kind: "auth-root" }, { kind: "platform-root" }, { kind: "scripts-root" }, { kind: "docs-root" });
    }

    // 3. Check Modules
    if (JSON.stringify(normOld.modules) !== JSON.stringify(normNew.modules)) {
      plan.deltas.push({ type: "ModulesChanged", changes: ["modules config mismatch"] });
      plan.artifacts.push({ kind: "scaffold-root" }, { kind: "platform-root" }, { kind: "docker-root" });
    }

    // 4. Check Domains
    const oldDomainKeys = normOld.domains.map(d => d.key);
    const newDomainKeys = normNew.domains.map(d => d.key);

    // Added Domains
    for (const key of newDomainKeys) {
      if (!oldDomainKeys.includes(key)) {
        plan.deltas.push({ type: "DomainAdded", domainKey: key });
        plan.artifacts.push({ kind: "domain-root", domain: key });
        plan.artifacts.push({ kind: "platform-root" }, { kind: "docs-root" });
      }
    }

    // Removed Domains
    for (const key of oldDomainKeys) {
      if (!newDomainKeys.includes(key)) {
        plan.deltas.push({ type: "DomainRemoved", domainKey: key });
        return this.fullPlan(`Domain removal (${key}) requires full regenerate for safe cleanup.`);
      }
    }

    // Updated Domains
    for (const newDomain of normNew.domains) {
      const oldDomain = normOld.domains.find(d => d.key === newDomain.key);
      if (oldDomain) {
        if (JSON.stringify(oldDomain) !== JSON.stringify(newDomain)) {
          // Sub-diff entities and services
          const entityDeltas = this.diffEntities(oldDomain, newDomain);
          const serviceDeltas = this.diffServices(oldDomain, newDomain);
          
          if (entityDeltas.length > 0 || serviceDeltas.length > 0) {
            plan.deltas.push(...entityDeltas, ...serviceDeltas);
            
            for (const delta of entityDeltas) {
              if (delta.type === "EntityAdded" || delta.type === "EntityUpdated" || delta.type === "EntityRemoved") {
                plan.artifacts.push({ kind: "entity", domain: newDomain.key, entity: (delta as any).entityName });
                plan.artifacts.push({ kind: "dto", domain: newDomain.key, entity: (delta as any).entityName });
                plan.artifacts.push({ kind: "domain-module", domain: newDomain.key });
                plan.artifacts.push({ kind: "migration" });
              }
            }
            for (const delta of serviceDeltas) {
              if (delta.type === "ServiceAdded" || delta.type === "ServiceUpdated" || delta.type === "ServiceRemoved") {
                plan.artifacts.push({ kind: "service", domain: newDomain.key, service: (delta as any).serviceName });
                plan.artifacts.push({ kind: "controller", domain: newDomain.key, service: (delta as any).serviceName });
                plan.artifacts.push({ kind: "domain-module", domain: newDomain.key });
              }
            }
          } else {
            // General update if something else changed (e.g. domain name, description)
            plan.deltas.push({ type: "DomainUpdated", domainKey: newDomain.key, changes: ["general metadata changed"] });
            plan.artifacts.push({ kind: "domain-root", domain: newDomain.key });
          }
          plan.artifacts.push({ kind: "docs-root" });
        }
      }
    }

    // Hash check safety
    if (plan.deltas.length === 0 && JSON.stringify(normOld) !== JSON.stringify(normNew)) {
       return this.fullPlan("Specs differ but no granular deltas identified.");
    }

    if (plan.deltas.length > 0) {
      plan.artifacts.push({ kind: "lineage-root" });
    }

    // Deduplicate and normalize
    plan.artifacts = this.normalizeArtifacts(plan.artifacts);

    return plan;
  }

  static fullPlan(reason: string): ChangePlan {
    return {
      mode: "full",
      deltas: [{ type: "GlobalFallbackRequired", reason }],
      artifacts: [], // Full mode handles everything
      reasons: [reason],
    };
  }

  private static normalizeArtifacts(artifacts: ArtifactRef[]): ArtifactRef[] {
    const seen = new Set<string>();
    const unique = artifacts.filter(a => {
      const key = JSON.stringify(a);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Subsume logic: if a domain has "domain-root", we don't need individual artifacts for that domain
    const domainsWithRoot = new Set(
      unique.filter(a => a.kind === "domain-root").map(a => (a as any).domain)
    );

    const filtered = unique.filter(a => {
      if (a.kind === "entity" || a.kind === "dto" || a.kind === "service" || a.kind === "controller" || a.kind === "domain-module") {
        if (domainsWithRoot.has((a as any).domain)) return false;
      }
      return true;
    });

    // Sorting: scaffold first, then docker, then auth, then domain-root/modules, then entities/services, then platform, then docs, then scripts, then lineage
    const order: Record<string, number> = {
      "scaffold-root": 1,
      "docker-root": 2,
      "auth-root": 3,
      "readme-root": 4,
      "domain-root": 10,
      "domain-module": 11,
      "entity": 12,
      "dto": 13,
      "service": 14,
      "controller": 15,
      "platform-root": 20,
      "docs-root": 30,
      "scripts-root": 40,
      "lineage-root": 50,
    };

    return filtered.sort((a, b) => (order[a.kind] || 99) - (order[b.kind] || 99));
  }

  private static diffEntities(oldDomain: Domain, newDomain: Domain): TypedDelta[] {
    const deltas: TypedDelta[] = [];
    const oldEntities = oldDomain.entities || [];
    const newEntities = newDomain.entities || [];

    const oldNames = oldEntities.map(e => e.name);
    const newNames = newEntities.map(e => e.name);

    // Added
    for (const entity of newEntities) {
      if (!oldNames.includes(entity.name)) {
        deltas.push({ type: "EntityAdded", domainKey: newDomain.key, entityName: entity.name });
      }
    }

    // Removed
    for (const entity of oldEntities) {
      if (!newNames.includes(entity.name)) {
        deltas.push({ type: "EntityRemoved", domainKey: newDomain.key, entityName: entity.name });
      }
    }

    // Updated
    for (const newEntity of newEntities) {
      const oldEntity = oldEntities.find(e => e.name === newEntity.name);
      if (oldEntity && JSON.stringify(oldEntity) !== JSON.stringify(newEntity)) {
        deltas.push({ type: "EntityUpdated", domainKey: newDomain.key, entityName: newEntity.name });
      }
    }

    return deltas;
  }

  private static diffServices(oldDomain: Domain, newDomain: Domain): TypedDelta[] {
    const deltas: TypedDelta[] = [];
    const oldServices = oldDomain.services || [];
    const newServices = newDomain.services || [];

    const oldNames = oldServices.map(s => s.name);
    const newNames = newServices.map(s => s.name);

    // Added
    for (const service of newServices) {
      if (!oldNames.includes(service.name)) {
        deltas.push({ type: "ServiceAdded", domainKey: newDomain.key, serviceName: service.name });
      }
    }

    // Removed
    for (const service of oldServices) {
      if (!newNames.includes(service.name)) {
        deltas.push({ type: "ServiceRemoved", domainKey: newDomain.key, serviceName: service.name });
      }
    }

    // Updated
    for (const newService of newServices) {
      const oldService = oldServices.find(s => s.name === newService.name);
      if (oldService && JSON.stringify(oldService) !== JSON.stringify(newService)) {
        deltas.push({ type: "ServiceUpdated", domainKey: newDomain.key, serviceName: newService.name });
      }
    }

    return deltas;
  }

  private static dedupeArtifacts(artifacts: ArtifactRef[]): ArtifactRef[] {
    const seen = new Set<string>();
    return artifacts.filter(a => {
      const key = JSON.stringify(a);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  static explainPlan(plan: ChangePlan): string[] {
    const explanationsNode: string[] = [];
    if (plan.mode === "full") {
      explanationsNode.push(`⚠️ Full regeneration required: ${plan.reasons.join(", ")}`);
    } else {
      explanationsNode.push(`✅ Incremental plan generated with ${plan.deltas.length} deltas.`);
      for (const delta of plan.deltas) {
        explanationsNode.push(`  - ${delta.type}: ${JSON.stringify(delta)}`);
      }
    }
    return explanationsNode;
  }
}
