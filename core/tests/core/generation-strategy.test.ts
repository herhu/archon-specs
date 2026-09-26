import { describe, it, expect } from "vitest";
import { DefaultRuleBuilder } from "../../src/builders/default-rule-builder.js";
import { normalizeSpec } from "../../src/core/state/normalize.js";

const spec = normalizeSpec({
  version: "1.0.0",
  name: "Strat",
  domains: [
    {
      key: "billing",
      name: "billing",
      entities: [{ name: "Invoice", primaryKey: "id", fields: [{ name: "id", type: "uuid", primary: true }] }],
      services: [{ name: "InvoiceService", entity: "Invoice", route: "invoices", crud: ["create", "findOne"] }],
    },
  ],
} as any);

describe("Generation strategy — topological layering", () => {
  const rules = new DefaultRuleBuilder().build(spec, "/out");

  it("assigns dependency layers per the artifact lattice (entity < dto < service < controller < module)", () => {
    const layerOf = (idMatch: RegExp) => rules.find((r) => idMatch.test(r.id))?.layer;
    expect(layerOf(/scaffold\.entity\./)).toBe(0);
    expect(layerOf(/scaffold\.dto\.[^u]/)).toBe(1); // create dto
    expect(layerOf(/scaffold\.dto\.update\./)).toBe(1);
    expect(layerOf(/scaffold\.service\./)).toBe(2);
    expect(layerOf(/scaffold\.controller\./)).toBe(3);
    expect(layerOf(/scaffold\.billing\.module$/)).toBe(4); // domain module (not the root app.module)
  });

  it("keeps cross-file wiring (imports/registration) in the later 'merge' phase", () => {
    const wiring = rules.filter((r) => r.id.startsWith("app.module."));
    expect(wiring.length).toBeGreaterThan(0);
    wiring.forEach((r) => expect(r.phase).toBe("merge"));
  });
});
