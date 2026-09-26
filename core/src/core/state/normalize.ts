import { DesignSpec, Domain, Entity, Service, ModuleConfig, Relationship } from './spec';

/**
 * Deeply normalizes a DesignSpec into a canonical, bit-identical form.
 * Enforces alphabetical stability for non-ordered collections.
 */
export function normalizeSpec(spec: DesignSpec): DesignSpec {
    // 1. Deep Clone to prevent mutation of the input object
    const normalized = JSON.parse(JSON.stringify(spec)) as DesignSpec;

    // 2. Canonicalize Modules
    if (normalized.modules) {
        normalized.modules = normalized.modules.map(m => ({
            ...m,
            name: m.name || m.type // Default name to type if missing (Phase 2.6)
        }));
        // Sort modules by type, then name for stability
        normalized.modules.sort((a, b) => {
            const typeComp = (a.type || "").localeCompare(b.type || "");
            if (typeComp !== 0) return typeComp;
            return (a.name || "").localeCompare(b.name || "");
        });
    }

    // 3. Canonicalize Domains
    if (normalized.domains) {
        for (let i = 0; i < normalized.domains.length; i++) {
            const d = normalized.domains[i] as any;
            
            // 🛡️ Legacy Mapping: domain -> name
            if (!d.name && d.domain) {
                d.name = d.domain;
                delete d.domain;
            }
            
            // 🛡️ Sanitize Name: Ensure it's a valid identifier (Phase 2.6)
            if (d.name) {
                d.name = d.name.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^([0-9])/, '_$1');
            }

            // 🛡️ Auto-Keying: slugify name if key is missing
            if (!d.key && d.name) {
                d.key = d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            }

            // Sort Entities by name
            if (d.entities) {
                d.entities.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
                for (const e of d.entities) {
                    // 🛡️ Sanitize Entity Name
                    if (e.name) e.name = e.name.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^([0-9])/, '_$1');

                        // 🛡️ Legacy Mapping: attributes -> fields
                        if (!e.fields && (e as any).attributes) {
                            e.fields = (e as any).attributes;
                            delete (e as any).attributes;
                        }

                        // 🛡️ Legacy Mapping: key -> name (Entity)
                        if (!e.name && (e as any).key) {
                            e.name = (e as any).key;
                            delete (e as any).key;
                        }

                        if (e.fields) {
                            if (!Array.isArray(e.fields)) {
                                // 🔄 Transformation: Handle Keyed Object (Flexible Schema)
                                e.fields = Object.entries(e.fields).map(([name, field]: [string, any]) => ({
                                    ...(typeof field === 'object' ? field : { type: field }),
                                    name: (field && typeof field === 'object' && (field.name || field.key)) || name
                                }));
                            }
                        
                        // 🛡️ Field Sanitization & Type Hardening (Phase 2.6)
                        e.fields = e.fields.map((f: any) => {
                            let name = f.name;
                            if (name) name = name.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^([0-9])/, '_$1');

                            let type = f.type;
                            if (type === true || type === "true") type = "boolean";
                            if (type === false || type === "false") type = "boolean";
                            if (typeof type === "number") type = "int";
                            if (typeof type === "string") type = type.trim().toLowerCase();
                            
                            // Map common aliases
                            if (type === "integer" || type === "long") type = "int";
                            if (type === "double") type = "float";
                            if (type === "date" || type === "datetime") type = "timestamp";
                            
                            return { ...f, name, type: type || "string" };
                        });

                        e.fields.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
                    }
                    // Sort Relationships by property name (name)
                    if (e.relationships) {
                        e.relationships.sort((a: Relationship, b: Relationship) => (a.name || "").localeCompare(b.name || ""));
                    }
                }
            }

            // Sort Services by name
            if (d.services) {
                d.services.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
                for (const s of d.services) {
                    // 🛡️ Legacy Mapping: endpoints -> operations
                    if (!s.operations && (s as any).endpoints) {
                        s.operations = (s as any).endpoints;
                        delete (s as any).endpoints;
                    }

                    // 🛡️ Legacy Mapping: baseRoute/basePath/path -> route
                    if (!s.route) {
                        s.route = (s as any).baseRoute || (s as any).basePath || (s as any).path;
                        if (s.route) {
                            delete (s as any).baseRoute;
                            delete (s as any).basePath;
                            delete (s as any).path;
                        } else if (s.name) {
                            // Auto-generate route from name
                            s.route = s.name.toLowerCase().replace(/service$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                        }
                    }

                    // Sort Operations by name
                    if (s.operations) {
                        for (const op of s.operations) {
                            // 🛡️ Legacy Mapping: method/path in endpoint -> operation
                            if (!op.name && op.path) {
                                // Generate a name from path if missing
                                op.name = (op.method || 'GET').toLowerCase() + op.path.replace(/[^a-zA-Z0-9]/g, '_');
                            }
                            // 🛡️ Auto-Pathing: generate path from name if missing
                            if (!op.path && op.name) {
                                op.path = `/${op.name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}`;
                            }
                        }
                        s.operations.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
                    }
                }
            }
        }
        
        normalized.domains.sort((a, b) => (a.key || "").localeCompare(b.key || ""));
    }

    return normalized;
}
