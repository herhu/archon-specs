import Ajv from "ajv";
import { DesignSpec } from '../state/spec';
import { VirtualTree } from '../vfs/vfs';
import * as path from 'path';
import * as fs from 'fs';

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export interface Validator {
    id: string;
    validate(vfs: VirtualTree): Promise<ValidationResult>;
}

const ajv = new Ajv({ allErrors: true });

import * as specSchema from '../state/designspec.schema.json';

export { specSchema };

export function validateSpecSchema(spec: any): string[] {
    try {
        // Handle potential Module Namespace wrapping in some ESM environments
        const actualSchema = (specSchema as any).default || specSchema;
        
        if (!actualSchema || typeof actualSchema !== 'object' || Object.keys(actualSchema).length === 0) {
            console.error("[TRACE:ARCHON:validator] 🛑 Schema is empty or invalid!");
            return ["Internal Error: Architectural Schema could not be loaded."];
        }

        const validate = ajv.compile(actualSchema);
        validate(spec);
        const errors = validate.errors?.map(e => `${e.instancePath} ${e.message}`) || [];

        // Explicit version check if schema didn't catch it
        if (spec.version && !spec.version.startsWith("1.")) {
            errors.push("Spec version must start with '1.'");
        }

        return errors;
    } catch (err: any) {
        console.error(`[TRACE:ARCHON:validator] 💥 AJV Compilation/Validation Error: ${err.message}`);
        return [`Schema Validation Engine Crash: ${err.message}`];
    }
}

const SQL_RESERVED_KEYWORDS = new Set([
    "USER", "POST", "LIKE", "COMMENT", "ORDER", "GROUP", "BY", "SELECT", "FROM", "WHERE", "JOIN", "ON",
    "TABLE", "DATABASE", "SCHEMA", "PRIMARY", "KEY", "FOREIGN", "CONSTRAINT", "INDEX", "VIEW", "GRANT",
    "REVOKE", "TRANSACTION", "COMMIT", "ROLLBACK", "SAVEPOINT", "LOCK", "ALTER", "CREATE", "DROP", "RENAME",
    "TRUNCATE", "INSERT", "UPDATE", "DELETE", "MERGE", "CALL", "EXECUTE", "DESCRIBE", "EXPLAIN", "SHOW"
]);

function isValidIdentifier(name: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && !SQL_RESERVED_KEYWORDS.has(name.toUpperCase());
}

export function validateSpecSemantic(spec: DesignSpec): string[] {
    const errors: string[] = [];
    const domainKeys = new Set<string>();

    spec.domains.forEach(d => {
        if (!isValidIdentifier(d.name)) {
            errors.push(`Invalid or reserved domain name: "${d.name}".`);
        }
        if (domainKeys.has(d.key)) {
            errors.push(`Duplicate domain key: ${d.key}`);
        }
        domainKeys.add(d.key);

        (d.entities || []).forEach(e => {
            if (!e.name || !isValidIdentifier(e.name)) {
                errors.push(`Invalid or reserved entity name "${e.name}" in domain "${d.name}".`);
            }
            const fields = Array.isArray(e.fields) 
                ? e.fields 
                : (e.fields ? Object.entries(e.fields).map(([name, f]: [string, any]) => ({ ...(typeof f === 'object' ? f : { type: f }), name: f.name || name })) : []);

            fields.forEach(f => {
                if (!isValidIdentifier(f.name)) {
                    errors.push(`Invalid or reserved field name: "${f.name}" in entity "${e.name}".`);
                }
                if (f.name.toLowerCase().includes("invocations")) {
                    errors.push(`Potential corruption detected in field name: "${f.name}" in entity "${e.name}".`);
                }
            });

            // PostgreSQL partitioning rules — catch impossible configurations at
            // validation time instead of failing at `db:migrate`.
            if ((e as any).partitionBy) {
                const partitionField = (e as any).partitionBy.field;
                const pkName = e.primaryKey || fields.find((f: any) => f.primary)?.name || 'id';
                if (partitionField !== pkName) {
                    errors.push(`Entity "${e.name}": partitionBy.field "${partitionField}" must be the primary key ("${pkName}"). PostgreSQL requires the primary key to include the partition key — partition by the primary key, or remove partitionBy.`);
                }
                fields.filter((f: any) => f.unique && !f.primary).forEach((f: any) => {
                    errors.push(`Entity "${e.name}": field "${f.name}" is unique, but the entity is partitioned. PostgreSQL cannot enforce a UNIQUE constraint on a partitioned table unless it includes the partition key — remove "unique" from "${f.name}" or remove partitionBy (enforce uniqueness in the application layer instead).`);
                });
                ((e as any).indexes || []).filter((ix: any) => ix.unique && !(ix.fields || []).includes(partitionField)).forEach((ix: any) => {
                    errors.push(`Entity "${e.name}": unique index on (${(ix.fields || []).join(', ')}) must include the partition key "${partitionField}" on a partitioned table.`);
                });
            }
        });

        (d.services || []).forEach(s => {
            if (!s.name || !isValidIdentifier(s.name)) {
                errors.push(`Invalid or reserved service name "${s.name}" in domain "${d.name}".`);
            }
            if (d.entities.length > 1 && !s.entity) {
                errors.push(`Service ${s.name} inside domain ${d.name} is ambiguous. Domain has multiple entities, so service.entity must be specified.`);
            }

            if (s.entity) {
                const entityExists = d.entities.find(e => e.name === s.entity);
                if (!entityExists) {
                    errors.push(`Service ${s.name} references missing entity: ${s.entity}`);
                }
            }

            s.operations?.forEach(op => {
                if (!isValidIdentifier(op.name)) {
                    errors.push(`Invalid or reserved operation name: "${op.name}" in service "${s.name}".`);
                }
                if (op.authz?.scopesAll) {
                    if (!Array.isArray(op.authz.scopesAll)) {
                        errors.push(`Operation ${op.name} in service ${s.name} has invalid authz.scopesAll (must be array)`);
                    } else {
                        op.authz.scopesAll.forEach(scope => {
                            if (!scope.startsWith(`${d.key}:`)) {
                                errors.push(`Invalid scope "${scope}" in operation "${op.name}". must start with domain key "${d.key}:"`);
                            }
                        });
                    }
                }
            });
        });
    });

    return errors;
}

function detectIndexCorruption(obj: any, path: string = ''): string[] {
    const errors: string[] = [];
    if (!obj) return errors;

    if (Array.isArray(obj)) {
        obj.forEach((item, i) => {
            const currentPath = `${path}[${i}]`;
            if (typeof item === 'number') {
                // This is the classic "LLM Context Degradation" signature
                errors.push(`Architectural Corruption: Expected object at ${currentPath} but found index ${item}. The LLM has lost structural context.`);
            } else if (typeof item === 'object') {
                errors.push(...detectIndexCorruption(item, currentPath));
            }
        });
    } else if (typeof obj === 'object') {
        Object.entries(obj).forEach(([key, value]) => {
            errors.push(...detectIndexCorruption(value, path ? `${path}.${key}` : key));
        });
    }
    return errors;
}

/**
 * Validates an individual shard against its specific schema.
 */
export function validateShard(type: 'requirement' | 'architecture' | 'domain' | 'capability', data: any): string[] {
    try {
        const actualSchema = (specSchema as any).default || specSchema;
        if (!actualSchema) return ["Internal Error: Schema could not be loaded."];

        let schemaToUse: any = null;
        switch (type) {
            case 'domain':
                schemaToUse = { ...actualSchema.definitions.domain, definitions: actualSchema.definitions };
                break;
            case 'requirement':
                // Requirements have a separate schema in the template, but we can also use a basic one here
                schemaToUse = { type: 'object', required: ['version', 'businessRules'], properties: { version: { type: 'string' }, businessRules: { type: 'array' } } };
                break;
            case 'architecture':
                schemaToUse = { type: 'object', required: ['version', 'domainShards'], properties: { version: { type: 'string' }, domainShards: { type: 'array' } } };
                break;
            default:
                return ["Unsupported shard type for validation."];
        }

        const validate = ajv.compile(schemaToUse);
        validate(data);
        return validate.errors?.map(e => `${e.instancePath} ${e.message}`) || [];
    } catch (err: any) {
        return [`Shard Validation Engine Crash: ${err.message}`];
    }
}

/**
 * Robustly finds the 'spec' directory by searching up and down from the current directory.
 */
export function findSpecDir(startDir: string): string | null {
    let current = path.resolve(startDir);
    
    // Search up
    while (current !== path.parse(current).root) {
        const specPath = path.join(current, 'spec');
        if (fs.existsSync(specPath) && fs.statSync(specPath).isDirectory()) return specPath;
        current = path.dirname(current);
    }

    // Search common subdirectories
    const common = ['src/templates/workspace/spec', 'archon/src/templates/workspace/spec'];
    for (const rel of common) {
        const p = path.join(process.cwd(), rel);
        if (fs.existsSync(p)) return p;
    }

    return null;
}

/**
 * Validates that a domain shard aligns with the Requirement Contract (manifest.json).
 */
export function validateContractAlignment(domain: any, manifest: any): string[] {
    const errors: string[] = [];
    if (!manifest || Object.keys(manifest).length === 0) return errors;
    
    const allowedDomains = manifest.domains || [];
    if (allowedDomains.length > 0) {
        const isAllowed = allowedDomains.some((d: any) => 
            (typeof d === 'string' && (d === domain.name || d === domain.key)) ||
            (typeof d === 'object' && (d.name === domain.name || d.key === domain.key))
        );
        if (!isAllowed) {
            errors.push(`Domain "${domain.name}" is not defined in the Requirement Contract (manifest.json).`);
        }
    }

    // Check if entities mentioned in domain are at least conceptually present in requirements
    const requirementContext = [
        ...(manifest.businessRules || []),
        ...(manifest.events || []),
        ...(manifest.invariants || []),
        ...(manifest.actors?.map((a: any) => a.capabilities).flat() || [])
    ].join(" ").toLowerCase();

    (domain.entities || []).forEach((e: any) => {
        const entityName = (e.name || "").toLowerCase();
        // Allow common entities or those mentioned in context
        const isCommon = ["user", "audit", "log", "profile"].some(c => entityName.includes(c));
        if (entityName && !isCommon && !requirementContext.includes(entityName.replace(/_/g, ' '))) {
            // console.warn(`[TRACE:ARCHON:validator] Entity "${e.name}" might not be justified by requirements.`);
        }
    });

    return errors;
}

/**
 * Unified Phase 2.6 Validation Entry Point
 */
export function validatePhase26(spec: any): string[] {
    // 1. Detect structural corruption (The LLM "Index" Bug)
    const corruptionErrors = detectIndexCorruption(spec);
    if (corruptionErrors.length > 0) return corruptionErrors;

    // 2. Schema Validation
    const schemaErrors = validateSpecSchema(spec);
    if (schemaErrors.length > 0) return schemaErrors;
    
    // 3. Semantic & Governance Validation
    return validateSpecSemantic(spec as DesignSpec);
}
