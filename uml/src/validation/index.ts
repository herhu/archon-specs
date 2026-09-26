import { DiagramIR, DiagramIRSchema } from "../schema/ir.js";
import { z } from "zod";

export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    path: string;
    message: string;
    code?: string;
  }>;
}

export function validateDiagramIR(ir: unknown): ValidationResult {
  // 1. Schema Validation
  const result = DiagramIRSchema.safeParse(ir);
  
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.errors.map(err => ({
        path: err.path.join("."),
        message: err.message,
        code: err.code
      }))
    };
  }

  const validIR = result.data;
  const semanticErrors: ValidationResult["errors"] = [];

  // 2. Semantic Validation
  
  // Create a map of all element IDs for quick lookup
  const elementIds = new Set<string>();
  for (const diagram of validIR.diagrams) {
    for (const element of diagram.elements) {
      if (elementIds.has(element.id)) {
        semanticErrors.push({
          path: `diagrams[${diagram.id}].elements`,
          message: `Duplicate element ID found: ${element.id}`,
          code: "DUPLICATE_ID"
        });
      }
      elementIds.add(element.id);
    }
  }

  // Validate relationships reference existing IDs
  for (const diagram of validIR.diagrams) {
    for (const rel of diagram.relationships) {
      if (!elementIds.has(rel.from)) {
        semanticErrors.push({
          path: `diagrams[${diagram.id}].relationships[${rel.id}]`,
          message: `Relationship 'from' reference not found: ${rel.from}`,
          code: "INVALID_REFERENCE"
        });
      }
      if (!elementIds.has(rel.to)) {
        semanticErrors.push({
          path: `diagrams[${diagram.id}].relationships[${rel.id}]`,
          message: `Relationship 'to' reference not found: ${rel.to}`,
          code: "INVALID_REFERENCE"
        });
      }
    }
  }

  // TODO: Add more specific semantic rules (e.g. valid types, acyclic dependencies where required)

  if (semanticErrors.length > 0) {
    return {
      valid: false,
      errors: semanticErrors
    };
  }

  return {
    valid: true,
    errors: []
  };
}
