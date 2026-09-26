
import { DesignSpec, Domain, Entity, Service, Operation } from './spec.js';
import { computeSpecFingerprint } from './utils/fingerprint.js';

export function generateModelDiagram(spec: DesignSpec): string {
    // Provenance: stamp which spec version this diagram represents so drift
    // against a materialized project becomes detectable, not silent.
    // (classDiagram must lead; the %% comment follows it.)
    let lines: string[] = ['classDiagram', `%% archon:spec ${computeSpecFingerprint(spec)}`];
    
    // Add domains/namespaces
    if (spec.domains) {
        for (const domain of spec.domains) {
            if (domain.entities) {
                for (const entity of domain.entities) {
                    lines.push(`    class ${entity.name}`);
                    // Explicitly route click events to window.handleClassClick
                    lines.push(`    click ${entity.name} call handleClassClick() "Edit ${entity.name}"`);
                    
                    // Fields - Collect potential FKs
                    if (entity.fields) {
                        for (const field of entity.fields) {
                            const type = field.type || 'string';
                            // Mark PK
                            if (field.primary) {
                                lines.push(`    ${entity.name} : +${type} ${field.name} PK`);
                            } else if (field.name.endsWith('Id') && field.name.length > 2) {
                                // Potential Foreign Key notation
                                lines.push(`    ${entity.name} : +${type} ${field.name} FK`);
                            } else {
                                lines.push(`    ${entity.name} : +${type} ${field.name}`);
                            }
                        }
                    }
                }
            }
            
            // Relationships
            if (domain.entities) {
                const drawnRelationships = new Set<string>();

                for (const entity of domain.entities) {
                    // 1. Explicit Phase 2.6 Relationships
                    if (entity.relationships) {
                        for (const rel of entity.relationships) {
                            const target = findEntity(spec, rel.targetEntity);
                            if (target) {
                                let cardinality = '--';
                                if (rel.type === 'oneToOne') cardinality = '"1" -- "1"';
                                else if (rel.type === 'oneToMany') cardinality = '"1" -- "*"';
                                else if (rel.type === 'manyToOne') cardinality = '"*" -- "1"';
                                else if (rel.type === 'manyToMany') cardinality = '"*" -- "*"';
                                
                                const relKey = `${entity.name}-${target.name}-${rel.name}`;
                                lines.push(`    ${entity.name} ${cardinality} ${target.name} : ${rel.name}`);
                                drawnRelationships.add(relKey);
                                // Also mark simple key to prevent heuristic duplicates
                                drawnRelationships.add(`${entity.name}-${target.name}`);
                            }
                        }
                    }

                    // 2. Explicit Foreign Keys (field.references) + Heuristic Fallbacks
                    if (entity.fields) {
                        for (const field of entity.fields) {
                            const targetType = field.type;
                            let targetEntityName: string | undefined;

                            // Authoritative: explicit references block (FK -> target entity)
                            if (field.references?.entity && field.references.entity !== 'Pending') {
                                targetEntityName = field.references.entity;
                            }
                            // Direct Type Reference
                            else if (targetType && !['string', 'int', 'boolean', 'uuid', 'json', 'timestamp'].includes(targetType.toLowerCase())) {
                                let searchType = targetType;
                                if (searchType.endsWith('Id') && searchType.length > 2) searchType = searchType.slice(0, -2);
                                targetEntityName = searchType;
                            }
                            // ID Reference
                            else if (field.name.endsWith('Id') && field.name.length > 2) {
                                const potential = field.name.slice(0, -2);
                                targetEntityName = potential.charAt(0).toUpperCase() + potential.slice(1);
                            }

                            if (targetEntityName) {
                                const target = findEntity(spec, targetEntityName);
                                if (target && !drawnRelationships.has(`${entity.name}-${target.name}`)) {
                                    lines.push(`    ${entity.name} --> ${target.name} : ${field.name}`);
                                    drawnRelationships.add(`${entity.name}-${target.name}`);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return lines.join('\n');
}

export function generateSequenceDiagram(spec: DesignSpec): string {
    let lines: string[] = ['sequenceDiagram'];
    lines.push('    autonumber');
    lines.push('    actor Client');
    lines.push('    participant API as API Gateway');
    
    // 1. Scan for Foreign Key relationships
    const relationships: Array<{from: string, to: string, field: string}> = [];
    
    if (spec.domains) {
        for (const d of spec.domains) {
            if (d.entities) {
                for (const e of d.entities) {
                    if (e.fields) {
                        for (const f of e.fields) {
                            // Authoritative: explicit references block (FK -> target entity)
                            if (f.references?.entity && f.references.entity !== 'Pending') {
                                const refTarget = findEntity(spec, f.references.entity);
                                if (refTarget && refTarget.name !== e.name) {
                                    relationships.push({ from: e.name, to: refTarget.name, field: f.name });
                                }
                                continue;
                            }

                            let targetType = f.type;
                            if (!targetType) continue;

                            let searchType = targetType;
                            if (searchType.endsWith('Id') && searchType.length > 2) {
                                searchType = searchType.slice(0, -2);
                            } else if (f.name.endsWith('Id') && f.name.length > 2) {
                                const potentialEntityName = f.name.slice(0, -2);
                                searchType = potentialEntityName.charAt(0).toUpperCase() + potentialEntityName.slice(1);
                            }

                            if (['string', 'int', 'boolean', 'uuid'].includes(searchType.toLowerCase())) continue;

                            const target = findEntity(spec, searchType) || findEntity(spec, targetType);
                            if (target && target.name !== e.name) {
                                relationships.push({ from: e.name, to: target.name, field: f.name });
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. De-duplicate relationships by 'from' and 'to' to keep diagram concise
    const uniqueRels: Array<{from: string, to: string, field: string}> = [];
    const seen = new Set<string>();
    for(const r of relationships) {
        const key = `${r.from}-${r.to}`;
        if(!seen.has(key)) {
            seen.add(key);
            uniqueRels.push(r);
        }
    }

    // 3. Render Architectural Flows
    if (uniqueRels.length > 0) {
        lines.push('    participant DB as Database');
        
        // Show max 3 relationships to keep it from getting too big
        const displayRels = uniqueRels.slice(0, 3);
        
        for (const rel of displayRels) {
            lines.push('');
            lines.push(`    Note over Client, DB: Cross-Service Resolution: ${rel.from} -> ${rel.to}`);
            lines.push(`    Client->>API: GET /${rel.from.toLowerCase()} (expand ${rel.to.toLowerCase()})`);
            lines.push(`    API->>${rel.from}Svc: get${rel.from}WithRelations()`);
            lines.push(`    ${rel.from}Svc->>DB: SELECT * FROM ${rel.from}`);
            lines.push(`    DB-->>${rel.from}Svc: ${rel.from} Data (includes ${rel.field})`);
            lines.push(`    ${rel.from}Svc->>${rel.to}Svc: resolve(${rel.field})`);
            lines.push(`    ${rel.to}Svc->>DB: SELECT * FROM ${rel.to} WHERE id`);
            lines.push(`    DB-->>${rel.to}Svc: ${rel.to} Data`);
            lines.push(`    ${rel.to}Svc-->>${rel.from}Svc: enriched data`);
            lines.push(`    ${rel.from}Svc-->>API: mapped DTO`);
            lines.push(`    API-->>Client: 200 OK`);
        }
        
        if (uniqueRels.length > 3) {
            lines.push('');
            lines.push(`    Note over Client, DB: ... (+${uniqueRels.length - 3} other inter-service relation flows omitted for brevity)`);
        }
        
    } else {
        // Fallback: generic architecture flow if no explicit FKs are found
        const firstDomain = spec.domains?.[0];
        const firstEntity = firstDomain?.entities?.[0]?.name || 'Entity';
        const firstSvc = `${firstEntity}Svc`;

        lines.push(`    participant Auth as AuthGuard`);
        lines.push(`    participant Svc as ${firstSvc}`);
        lines.push(`    participant DB as Database`);
        
        lines.push('');
        lines.push(`    Note over Client, DB: Standard Architecture Request Lifecycle`);
        lines.push(`    Client->>API: POST /${firstEntity.toLowerCase()}`);
        lines.push(`    API->>Auth: validate Token`);
        lines.push(`    Auth-->>API: isValid`);
        lines.push(`    API->>Svc: execute transaction`);
        lines.push(`    Svc->>DB: begin transaction`);
        lines.push(`    Svc->>DB: insert ${firstEntity}`);
        lines.push(`    DB-->>Svc: row created`);
        lines.push(`    Svc->>DB: commit`);
        lines.push(`    Svc-->>API: formatted DTO`);
        lines.push(`    API-->>Client: 201 Created`);
    }

    return lines.join('\n');
}


function findEntity(spec: DesignSpec, name: string): Entity | undefined {
    for (const d of spec.domains) {
        const found = d.entities.find(e => e.name === name);
        if (found) return found;
    }
    return undefined;
}
