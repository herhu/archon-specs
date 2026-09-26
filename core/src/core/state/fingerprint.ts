import { createHash } from "node:crypto";
import { DesignSpec } from "./spec";

/**
 * Deterministic, content-addressed fingerprint of a DesignSpec's STRUCTURAL
 * essence (domains, entities, fields incl. FK `references`, services).
 *
 * MUST stay byte-for-byte identical to the UML server's implementation
 * (servers/uml/src/transform/utils/fingerprint.ts) so a diagram and the
 * project materialized from the same spec produce the same fingerprint and
 * drift can be detected by comparison.
 */
export function computeSpecFingerprint(spec: DesignSpec): string {
  const canonical = canonicalizeSpec(spec);
  const json = stableStringify(canonical);
  return createHash("sha256").update(json).digest("hex").slice(0, 12);
}

function canonicalizeSpec(spec: DesignSpec): unknown {
  const domains = (spec.domains ?? [])
    .map((d) => ({
      key: d.key,
      entities: (d.entities ?? [])
        .map((e) => ({
          name: e.name,
          primaryKey: e.primaryKey,
          fields: (e.fields ?? [])
            .map((f) => ({
              name: f.name,
              type: f.type ?? "string",
              primary: !!f.primary,
              references: f.references
                ? { entity: f.references.entity, field: f.references.field }
                : null,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          relationships: (e.relationships ?? [])
            .map((r) => ({ name: r.name, type: r.type, targetEntity: r.targetEntity }))
            .sort((a, b) => (a.name + a.targetEntity).localeCompare(b.name + b.targetEntity)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      services: (d.services ?? [])
        .map((s) => ({
          name: s.name,
          operations: (s.operations ?? []).map((o) => o.name).sort(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return { name: spec.name, domains };
}

/** Deterministic JSON: object keys sorted recursively. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}
