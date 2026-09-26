import { describe, it, expect } from "vitest";
import { ChangePlanner } from "../../src/core/change-planner.js";
import { DesignSpec } from "../../src/core/spec.js";

describe("ChangePlanner", () => {
  const baseSpec: DesignSpec = {
    version: "1.0",
    name: "TestApp",
    domains: [
      {
        name: "Social",
        key: "social",
        entities: [],
        services: [],
      },
    ],
  };

  it("should return full plan if no old spec", () => {
    const plan = ChangePlanner.planChanges(null, baseSpec);
    expect(plan.mode).toBe("full");
    expect(plan.reasons).toContain("No previous spec provided");
  });

  it("should return no deltas if specs are identical", () => {
    const plan = ChangePlanner.planChanges(baseSpec, baseSpec);
    expect(plan.mode).toBe("artifact");
    expect(plan.deltas).toHaveLength(0);
    expect(plan.artifacts).toHaveLength(0);
  });

  it("should detect added domain", () => {
    const newSpec: DesignSpec = {
      ...baseSpec,
      domains: [
        ...baseSpec.domains,
        {
          name: "Billing",
          key: "billing",
          entities: [],
          services: [],
        },
      ],
    };
    const plan = ChangePlanner.planChanges(baseSpec, newSpec);
    expect(plan.mode).toBe("artifact");
    expect(plan.deltas).toContainEqual({ type: "DomainAdded", domainKey: "billing" });
    expect(plan.artifacts).toContainEqual({ kind: "domain-root", domain: "billing" });
    expect(plan.artifacts).toContainEqual({ kind: "platform-root" });
  });

  it("should fallback to full on domain removal", () => {
    const newSpec: DesignSpec = {
      ...baseSpec,
      domains: [],
    };
    const plan = ChangePlanner.planChanges(baseSpec, newSpec);
    expect(plan.mode).toBe("full");
    expect(plan.reasons[0]).toContain("Domain removal");
  });

  it("should detect platform change", () => {
    const newSpec: DesignSpec = {
      ...baseSpec,
      platform: { swagger: true },
    };
    const plan = ChangePlanner.planChanges(baseSpec, newSpec);
    expect(plan.mode).toBe("artifact");
    expect(plan.deltas[0].type).toBe("PlatformChanged");
    expect(plan.artifacts).toContainEqual({ kind: "platform-root" });
  });

  it("should detect entity and service deltas within a domain", () => {
    const oldSpec: DesignSpec = {
      name: "test",
      version: "1.0.0",
      domains: [
        { key: "billing", name: "Billing", entities: [{ name: "Invoice", fields: [] }], services: [] }
      ]
    };
    const newSpec: DesignSpec = {
      name: "test",
      version: "1.0.0",
      domains: [
        { 
          key: "billing", 
          name: "Billing",
          entities: [{ name: "Invoice", fields: [{ name: "amount", type: "number" }] }, { name: "Payment", fields: [] }], 
          services: [{ name: "BillingService", route: "/billing" }] 
        }
      ]
    };

    const plan = ChangePlanner.planChanges(oldSpec, newSpec);
    
    expect(plan.mode).toBe("artifact");
    expect(plan.deltas).toContainEqual(expect.objectContaining({ type: "EntityUpdated", entityName: "Invoice" }));
    expect(plan.deltas).toContainEqual(expect.objectContaining({ type: "EntityAdded", entityName: "Payment" }));
    expect(plan.deltas).toContainEqual(expect.objectContaining({ type: "ServiceAdded", serviceName: "BillingService" }));
    expect(plan.artifacts).toContainEqual({ kind: "domain-module", domain: "billing" });
  });
});
