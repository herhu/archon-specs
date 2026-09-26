import { describe, it, expect } from "vitest";
import { renderTemplate, expectToContain, expectNotToContain } from "../helpers/test-runner.js";

describe("transactional-service.ts.hbs", () => {
  const ctx = {
    service: {
      name: "OrderService",
      operations: [{ name: "placeOrder", params: "_dto: any", returnType: "Promise<any>" }],
    },
    serviceClassName: "OrderService",
    entity: { name: "PurchaseOrder" },
    relatedEntities: [],
    repoPort: "PurchaseOrderRepository",
    repoToken: "PURCHASE_ORDER_REPOSITORY",
    repoPortImport: "../repositories/purchase-order.repository",
    crud: { create: true, findAll: true, findOne: true, update: true, delete: true },
    idType: "string",
    idName: "id",
  };

  it("wraps CRUD writes in dataSource.transaction and injects the port + DataSource", async () => {
    const out = await renderTemplate("nestjs/transactional-service.ts.hbs", ctx);
    expectToContain(out, [
      "import { DataSource } from 'typeorm';",
      "import { PurchaseOrderRepository, PURCHASE_ORDER_REPOSITORY }",
      "@Inject(PURCHASE_ORDER_REPOSITORY)",
      "private readonly repo: PurchaseOrderRepository",
      "private readonly dataSource: DataSource",
      "async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrder>",
      "this.dataSource.transaction(async (manager) =>",
      "manager.create(PurchaseOrder",
      "async findAll(): Promise<PurchaseOrder[]>",
      "this.repo.findAll()",
      "async findOne(id: string): Promise<PurchaseOrder>",
      "this.repo.findById(id)",
      "throw new NotFoundException(",
    ]);
  });

  it("does NOT render custom operations (E3 moved them to use-cases)", async () => {
    const out = await renderTemplate("nestjs/transactional-service.ts.hbs", ctx);
    // Custom business processes now live in their own @ArchonManual use-case classes,
    // not as stub methods on the service. The service is CRUD-only.
    expect(out).not.toContain("placeOrder");
    expect(out).not.toContain("@ArchonManual");
  });
});
