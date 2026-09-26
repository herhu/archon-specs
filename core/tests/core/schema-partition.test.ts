import { describe, it, expect } from "vitest";
import { renderTemplate } from "../helpers/test-runner.js";
import { validateSpecSemantic } from "../../src/core/validators/validator.js";

// Regression coverage for the partitioned-table bug from a production run:
//   ERROR: unique constraint on partitioned table must include all partitioning columns
// plus the silent killer behind it: PARTITION BY was emitted with NO partitions,
// so even valid DDL would reject every INSERT at runtime.

const partitionedEntity = (extra: any = {}) => ({
  name: "AncillaryCatalog",
  primaryKey: "id",
  partitionBy: { type: "HASH", field: "id" },
  fields: [
    { name: "id", type: "uuid", primary: true },
    { name: "name", type: "string" },
    ...(extra.fields || []),
  ],
  ...extra.entity,
});

const renderSchema = (entities: any[]) =>
  renderTemplate("nestjs/db/schema.sql.hbs", { domains: [{ name: "ancillary", key: "ancillary", entities }] });

describe("schema.sql — partitioned tables", () => {
  it("emits HASH partitions so the table accepts inserts", async () => {
    const sql = await renderSchema([partitionedEntity()]);
    expect(sql).toContain('PARTITION BY HASH ("id")');
    for (const r of [0, 1, 2, 3]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS "ancillary_catalog_p${r}" PARTITION OF "ancillary_catalog" FOR VALUES WITH (MODULUS 4, REMAINDER ${r});`);
    }
  });

  it("emits a DEFAULT partition for LIST/RANGE", async () => {
    const sql = await renderSchema([
      partitionedEntity({ entity: { partitionBy: { type: "LIST", field: "id" } } }),
    ]);
    expect(sql).toContain('PARTITION BY LIST ("id")');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "ancillary_catalog_default" PARTITION OF "ancillary_catalog" DEFAULT;');
  });

  it("never emits column-level UNIQUE on a partitioned table (Postgres rejects it)", async () => {
    const sql = await renderSchema([
      partitionedEntity({ fields: [{ name: "code", type: "string", unique: true }] }),
    ]);
    expect(sql).not.toMatch(/UNIQUE/);
  });

  it("keeps UNIQUE on non-partitioned tables", async () => {
    const sql = await renderSchema([
      { name: "Plain", primaryKey: "id", fields: [{ name: "id", type: "uuid", primary: true }, { name: "code", type: "string", unique: true }] },
    ]);
    expect(sql).toContain('"code" TEXT NOT NULL UNIQUE');
  });
});

describe("validator — partitioning constraints fail loudly", () => {
  const spec = (entities: any[]): any => ({
    version: "1.0.0",
    name: "P",
    domains: [{ name: "ancillary", key: "ancillary", entities, services: [] }],
  });

  it("accepts partition by the primary key with no unique fields", () => {
    expect(validateSpecSemantic(spec([partitionedEntity()]))).toEqual([]);
  });

  it("rejects a unique field on a partitioned entity, with an actionable message", () => {
    const errors = validateSpecSemantic(spec([
      partitionedEntity({ fields: [{ name: "code", type: "string", unique: true }] }),
    ]));
    expect(errors.join(" ")).toMatch(/UNIQUE constraint on a partitioned table|cannot enforce a UNIQUE/i);
    expect(errors.join(" ")).toContain('"code"');
  });

  it("rejects partitionBy.field that is not the primary key", () => {
    const errors = validateSpecSemantic(spec([
      partitionedEntity({ entity: { partitionBy: { type: "HASH", field: "name" } } }),
    ]));
    expect(errors.join(" ")).toMatch(/must be the primary key/);
  });

  it("rejects a unique composite index missing the partition key", () => {
    const errors = validateSpecSemantic(spec([
      partitionedEntity({ entity: { indexes: [{ fields: ["name"], unique: true }], partitionBy: { type: "HASH", field: "id" } } }),
    ]));
    expect(errors.join(" ")).toMatch(/must include the partition key/);
  });
});
