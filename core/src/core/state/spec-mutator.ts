import { DesignSpec, Domain, Entity } from './spec';

export class SpecMutator {
    /**
     * Adds a new domain to the spec or merges into an existing one.
     */
    public static addDomain(spec: DesignSpec, newDomain: Domain): DesignSpec {
        const existingDomainIndex = spec.domains.findIndex(d => d.key === newDomain.key);
        
        if (existingDomainIndex >= 0) {
            // Merge entities and services
            const existingDomain = spec.domains[existingDomainIndex];
            
            // Update metadata
            existingDomain.name = newDomain.name;

            newDomain.entities.forEach(newEntity => {
                const entityIndex = existingDomain.entities.findIndex(e => e.name === newEntity.name);
                if (entityIndex >= 0) {
                    existingDomain.entities[entityIndex] = newEntity;
                } else {
                    existingDomain.entities.push(newEntity);
                }
            });

            newDomain.services.forEach(newService => {
                const serviceIndex = existingDomain.services.findIndex(s => s.name === newService.name);
                if (serviceIndex >= 0) {
                    existingDomain.services[serviceIndex] = newService;
                } else {
                    existingDomain.services.push(newService);
                }
            });
        } else {
            spec.domains.push(newDomain);
        }

        return spec;
    }

    /**
     * Adds an entity to a specific domain.
     */
    public static addEntity(spec: DesignSpec, domainKey: string, entity: Entity): DesignSpec {
        const domain = spec.domains.find(d => d.key === domainKey);
        if (!domain) {
            throw new Error(`Domain with key '${domainKey}' not found in spec.`);
        }

        const existingEntityIndex = domain.entities.findIndex(e => e.name === entity.name);
        if (existingEntityIndex >= 0) {
            domain.entities[existingEntityIndex] = entity;
        } else {
            domain.entities.push(entity);
        }

        return spec;
    }

    /**
     * Patches the top-level spec properties.
     */
    public static patchSpec(spec: DesignSpec, patch: Partial<DesignSpec>): DesignSpec {
        return { ...spec, ...patch };
    }

    /**
     * Normalizes the spec for deterministic hashing.
     */
    public static normalizeSpec(spec: DesignSpec): DesignSpec {
        const normalized = JSON.parse(JSON.stringify(spec)) as DesignSpec;
        
        // Normalize Modules: Auto-name if missing (Phase 2.6)
        if (normalized.modules) {
            normalized.modules = normalized.modules.map(m => ({
                ...m,
                name: m.name || m.type
            }));
        }

        // Sort domains by key
        normalized.domains.sort((a: any, b: any) => (a.key || "").localeCompare(b.key || ""));
        
        // Sort entities and services within domains
        for (const domain of normalized.domains) {
            domain.entities.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
            domain.services.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
        }
        
        return normalized;
    }
}
