import { DiagramIR } from "../schema/ir.js";
import { inferMethodAndPath } from './utils/methodMatcher.js';
import { determineRelTypes, parseCardinality } from './utils/cardinalityMatcher.js';

// Basic Archon DesignSpec v1 Types
export interface DesignSpec {
  name: string;
  version: string;
  domains: Domain[];
  modules?: any;
}

export interface Domain {
  name: string;
  key: string;
  entities: Entity[];
  services: Service[];
}

export interface Entity {
  name: string;
  primaryKey: string;
  fields: Field[];
  relationships?: Relationship[];
  indexes?: { name?: string; fields: string[]; unique?: boolean }[];
  partitionBy?: { type: 'LIST' | 'RANGE' | 'HASH'; field: string };
}

export interface Relationship {
  name: string;
  type: 'manyToOne' | 'oneToMany' | 'oneToOne' | 'manyToMany';
  targetEntity: string;
  joinColumn?: string;
  inverseProperty?: string;
}

export interface Field {
  name: string;
  type: string;
  primary?: boolean;
  optional?: boolean;
  unique?: boolean;
  references?: { entity: string; field: string };
  index?: boolean;
}

export interface Service {
  name: string;
  route: string;
  entity: string;
  crud: string[];
  operations?: Operation[];
}

export interface Operation {
  name: string;
  method: string;
  path: string;
  authz?: any;
}

export function transformIRToDesignSpec(ir: DiagramIR): DesignSpec {
  const spec: DesignSpec = {
    name: "Generated App",
    version: "1.0.0",
    domains: []
  };

  // Phase 1: Initialize Domains, Entities, and Services
  for (const diagram of ir.diagrams) {
      const domainName = (diagram.name && diagram.name !== "Untitled") ? diagram.name : "AppDomain";
      const currentDomain: Domain = {
          name: domainName,
          key: (diagram as any).key || domainName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          entities: [],
          services: []
      };

      for (const element of diagram.elements) {
          if (element.type === 'classifier' && element.kind === 'class') {
              const entity = transformClassToEntity(element as any);
              currentDomain.entities.push(entity);
              
              const entityLow = entity.name.toLowerCase();
              const serviceName = `${entity.name}Service`;
              if (!currentDomain.services.find(s => s.name === serviceName)) {
                  currentDomain.services.push({
                      name: serviceName,
                      route: `/${entityLow}s`,
                      entity: entity.name,
                      crud: ["create", "findAll", "findOne", "update", "delete"]
                  });
              }
          } else if (element.type === 'service') {
              const service = element as any;
              let existing = currentDomain.services.find(s => s.name === service.name);
              if (existing) {
                  existing.entity = service.entity || existing.entity;
                  if (existing.entity !== "None") {
                      existing.crud = ["create", "findAll", "findOne", "update", "delete"];
                  }
              } else {
                  currentDomain.services.push({
                      name: service.name,
                      route: `/${service.name.toLowerCase().replace(/service$/, '')}s`,
                      entity: service.entity || "None",
                      crud: service.entity !== "None" ? ["create", "findAll", "findOne", "update", "delete"] : [],
                      operations: []
                  });
              }
          } else if (element.type === 'component') {
              const serviceName = element.name.replace(/\s+/g, '');
              if (!currentDomain.services.find(s => s.name === serviceName)) {
                  currentDomain.services.push({
                      name: serviceName,
                      route: `/${serviceName.toLowerCase()}`,
                      entity: "None",
                      crud: [],
                      operations: []
                  });
              }
          }
      }
      spec.domains.push(currentDomain);
  }

  // Phase 2: Global Entity Indexing
  const allEntities = spec.domains.flatMap(d => d.entities);

  // Phase 3: Process Relationships Globally (Cross-Domain Integrity)
  for (const diagram of ir.diagrams) {
      for (const rel of diagram.relationships) {
          if (rel.type === 'message') continue;

          // Search for entities globally by name
          const sourceEntity = allEntities.find(e => e.name === rel.from);
          const targetEntity = allEntities.find(e => e.name === rel.to);
          
          if (sourceEntity && targetEntity) {
              if (!sourceEntity.relationships) sourceEntity.relationships = [];
              if (!targetEntity.relationships) targetEntity.relationships = [];
              
              const fromMult = rel.fromMultiplicity || '1';
              const toMult = rel.toMultiplicity || '1';
              const { forward: forwardType, backward: backwardType } = determineRelTypes(fromMult, toMult);

              // Semantic Naming: Use label if provided, otherwise camelCase target
              const forwardName = rel.label || (targetEntity.name.charAt(0).toLowerCase() + targetEntity.name.slice(1));
              const backwardName = sourceEntity.name.charAt(0).toLowerCase() + sourceEntity.name.slice(1);
              
              // 1:1 Ownership Decision: 
              // - If arrow is -->, source owns it.
              // - If arrow is <--, target owns it.
              // - If many-to-one, the "many" side always owns it.
              let sourceOwnsFk = (forwardType === 'manyToOne');
              let targetOwnsFk = (backwardType === 'manyToOne');
              
              if (forwardType === 'oneToOne') {
                  // Directional ownership for 1:1
                  sourceOwnsFk = rel.navigability === 'from-to'; 
                  targetOwnsFk = !sourceOwnsFk;
              }

              sourceEntity.relationships.push({
                  name: forwardName,
                  type: forwardType,
                  targetEntity: targetEntity.name,
                  joinColumn: sourceOwnsFk ? (targetEntity.name.charAt(0).toLowerCase() + targetEntity.name.slice(1) + "Id") : undefined,
                  inverseProperty: backwardName
              });

              targetEntity.relationships.push({
                  name: backwardName,
                  type: backwardType,
                  targetEntity: sourceEntity.name,
                  joinColumn: targetOwnsFk ? (sourceEntity.name.charAt(0).toLowerCase() + sourceEntity.name.slice(1) + "Id") : undefined,
                  inverseProperty: forwardName
              });

              // Reconciliation & Injection logic
              const forwardConfig = { ent: sourceEntity, type: forwardType, target: targetEntity, relName: forwardName, side: 'forward', owns: sourceOwnsFk, mult: toMult };
              const backwardConfig = { ent: targetEntity, type: backwardType, target: sourceEntity, relName: backwardName, side: 'backward', owns: targetOwnsFk, mult: fromMult };

              [forwardConfig, backwardConfig].forEach((cfg) => {
                  const { ent, type, target, relName, owns, mult } = cfg;
                  if (!owns) return; // Only process if this side owns the FK

                  if (type === 'manyToOne' || type === 'oneToOne') {
                      // Semantic Candidate Matching
                      let candidates = ent.fields.filter(f => {
                          const isRef = f.references?.entity === target.name || f.references?.entity === "Pending";
                          if (!isRef) return false;
                          
                          const nameMatches = f.name.toLowerCase().includes(target.name.toLowerCase()) || 
                                           f.name.toLowerCase().includes(relName.toLowerCase());
                          return nameMatches;
                      });

                      if (candidates.length === 0) {
                          const genericFk = ent.fields.find(f => f.references?.entity === "Pending");
                          if (genericFk) candidates = [genericFk];
                      }
                      
                      let fieldToUse: Field | undefined = undefined;
                      if (candidates.length === 1) {
                          fieldToUse = candidates[0];
                      } else if (candidates.length > 1) {
                          const strongMatch = candidates.find(f => f.name.toLowerCase().includes(target.name.toLowerCase()));
                          fieldToUse = strongMatch || candidates[0];
                      }

                      const joinColumn = fieldToUse ? fieldToUse.name : (target.name.charAt(0).toLowerCase() + target.name.slice(1) + "Id");
                      
                      // Update relationship joinColumn
                      const relObj = ent.relationships?.find(r => r.name === relName && r.targetEntity === target.name);
                      if (relObj) relObj.joinColumn = joinColumn;

                      const isOptional = parseCardinality(mult).isOptional;

                      if (!fieldToUse) {
                          let field = ent.fields.find(f => f.name === joinColumn);
                          if (!field) {
                              field = { name: joinColumn, type: "uuid", optional: isOptional };
                              ent.fields.push(field);
                          }
                          if (!field.references || field.references.entity === "Pending") {
                              field.references = { entity: target.name, field: "id" };
                              field.optional = isOptional;
                          }
                      } else {
                          fieldToUse.optional = isOptional;
                          if (fieldToUse.references?.entity === "Pending") {
                              fieldToUse.references.entity = target.name;
                          }
                      }
                  }
              });
          }
      }
  }

  // Phase 4: Sequence Diagram Enrichment
  for (const seq of ir.diagrams) {
      if (seq.kind !== 'sequence') continue;
      for (const r of seq.relationships) {
          const rel: any = r; 
          if (rel.type === 'message' && (rel.kind === 'sync' || rel.kind === 'async')) {
              const targetParticipant = seq.elements.find(e => e.id === rel.to);
              if (!targetParticipant) continue;
              
              const targetName = targetParticipant.name.replace(/\s+/g, ''); 
              let service = findService(spec, targetName);
              if (!service) service = findService(spec, targetName + "Service");
              
              if (service) {
                  const { method, path } = inferMethodAndPath(rel.label || "unnamedOperation");
                  const opName = rel.label ? rel.label.split('(')[0].replace(/\s+/g, '') : "unnamedOperation";
                  
                  if (!service.operations) service.operations = [];
                  if (!service.operations.find(o => o.name === opName)) {
                      service.operations.push({
                          name: opName,
                          method,
                          path, 
                          authz: { required: true }
                      });
                  }
              }
          }
      }
  }

  return spec;
}

function findService(spec: DesignSpec, name: string): Service | undefined {
    for (const d of spec.domains) {
        const s = d.services.find(svc => svc.name === name);
        if (s) return s;
    }
    return undefined;
}

function transformClassToEntity(clazz: any): Entity {
    let primaryKey = "id";
    const fields: Field[] = [];

    if (clazz.attributes) {
        for (const attr of clazz.attributes) {
            const mappedType = mapType(attr.typeRef?.name);
            const field: Field = {
                name: attr.name,
                type: mappedType
            };
            
            if (attr.name === 'id' || attr.name === 'ID' || attr.name === 'Id') {
                field.primary = true;
                primaryKey = attr.name;
            }
            if (attr.primary) field.primary = true;
            if (attr.nullable !== undefined) field.optional = attr.nullable;
            if (attr.unique) field.unique = true;
            if (attr.index) field.index = true;
            if (attr.references) field.references = attr.references;

            fields.push(field);
        }
    }

    if (!fields.find(f => f.name === primaryKey)) {
        fields.unshift({
            name: "id",
            type: "uuid",
            primary: true
        });
        primaryKey = "id";
    }

    return {
        name: clazz.name,
        primaryKey,
        fields,
        indexes: clazz.indexes,
        partitionBy: clazz.partitionBy
    };
}

function mapType(type: string): string {
    if (!type) return "string";
    const lower = type.toLowerCase();
    if (lower === 'uuid') return 'uuid';
    if (lower === 'string' || lower === 'text') return 'string';
    if (lower === 'int' || lower === 'integer') return 'int';
    if (lower === 'float' || lower === 'number' || lower === 'decimal') return 'float';
    if (lower === 'boolean' || lower === 'bool') return 'boolean';
    if (lower === 'timestamp' || lower === 'date' || lower === 'datetime') return 'timestamp';
    if (lower === 'json') return 'json';
    return "string";
}
