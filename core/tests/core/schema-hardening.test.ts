import { describe, it, expect } from "vitest";
import { validateSpecSchema } from "../../src/core/validators/validator.js";

// E0 / Theme-1 ("silent failure is the enemy"): the root spec object and
// modules.items must reject unknown keys, so a misplaced key (e.g. an `events`
// block at the wrong level) FAILS LOUDLY instead of validating clean + generating
// nothing. Regression guard for the DX-review CRITICAL finding.

const base = () => ({
  version: "1.0.0",
  name: "Hardening API",
  domains: [
    { name: "catalog", key: "catalog", entities: [{ name: "Product", fields: [{ name: "id", type: "uuid", primary: true }] }] },
  ],
});

describe("schema hardening — unknown keys fail loudly", () => {
  it("accepts a well-formed spec", () => {
    expect(validateSpecSchema(base())).toEqual([]);
  });

  it("rejects an unknown key at the root (misplaced spec surface)", () => {
    const spec: any = { ...base(), events: [{ name: "OrderPlaced" }] };
    const errors = validateSpecSchema(spec);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(" ")).toMatch(/additional propert/i);
  });

  it("rejects an unknown key inside a modules entry", () => {
    const spec: any = { ...base(), modules: [{ type: "queue.bullmq", name: "jobs", evnts: true }] };
    const errors = validateSpecSchema(spec);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(" ")).toMatch(/additional propert/i);
  });

  it("still accepts all legitimate root + module keys", () => {
    const spec: any = {
      ...base(),
      projectId: "p1",
      revisionId: "r1",
      platform: { cors: true },
      crossCutting: { auth: { jwt: { issuer: "i", audience: "a" } } },
      modules: [{ type: "cache.redis", name: "cache", config: {} }],
      handlebarsHelpers: ["math"],
      lineage: { blueprintId: "b1" },
    };
    expect(validateSpecSchema(spec)).toEqual([]);
  });
});
