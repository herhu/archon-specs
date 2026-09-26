import { describe, it, expect } from "vitest";
import { renderTemplate } from "../helpers/test-runner.js";

// Two entities where one FK-references the other; the referenced table is
// declared SECOND in spec order — the classic forward-reference that broke
// `CREATE TABLE ... REFERENCES` (DB init aborted with "relation does not exist").
const domains = [
  {
    name: "booking",
    entities: [
      {
        name: "BaggageRecord",
        primaryKey: "id",
        fields: [
          { name: "id", type: "uuid", primary: true },
          { name: "bookingRecordId", type: "uuid", references: { entity: "BookingRecord", field: "id" } },
        ],
      },
      {
        name: "BookingRecord",
        primaryKey: "id",
        fields: [{ name: "id", type: "uuid", primary: true }],
      },
    ],
  },
];

describe("schema.sql — order-independent foreign keys", () => {
  it("emits NO inline FK in CREATE TABLE and defers FKs to ALTER ADD CONSTRAINT", async () => {
    const sql = await renderTemplate("nestjs/db/schema.sql.hbs", { domains });
    const [tablesSection, fkSection = ""] = sql.split("2. FOREIGN KEYS");

    // Section 1 (table creation) must contain no FK references → creation order can't matter.
    expect(tablesSection).not.toMatch(/REFERENCES/);
    expect(tablesSection).toContain('CREATE TABLE IF NOT EXISTS "baggage_record"');
    expect(tablesSection).toContain('CREATE TABLE IF NOT EXISTS "booking_record"');

    // Section 2 adds the FK, guarded for idempotency.
    expect(fkSection).toContain('ADD CONSTRAINT "fk_baggage_record_bookingRecordId"');
    expect(fkSection).toContain('REFERENCES "booking_record"("id")');
    expect(fkSection).toContain("pg_constraint"); // idempotency guard
  });
});
