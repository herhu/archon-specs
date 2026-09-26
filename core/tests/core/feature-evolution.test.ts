import { describe, it, expect } from "vitest";
import { VirtualTree } from "../../src/core/vfs/vfs.js";
import { AstEditor } from "../../src/core/vfs/ast-editor.js";
import { renderTemplate } from "../helpers/test-runner.js";

const useCaseCtx = (returnType: string) => ({
  opName: "registerAttendee",
  useCaseClass: "RegisterAttendeeUseCase",
  entityName: "AttendeeProfile",
  repoPort: "AttendeeProfileRepository",
  repoToken: "ATTENDEE_PROFILE_REPOSITORY",
  repoPortImport: "../repositories/attendee-profile.repository",
  commandType: "any",
  returnType,
});

describe("Feature evolution — @ArchonManual preservation (E3 use-case seam)", () => {
  it("preserves human business logic in the @ArchonManual execute() across regeneration", async () => {
    const v1 = await renderTemplate("nestjs/use-case.ts.hbs", useCaseCtx("Promise<any>"));

    const vfs = new VirtualTree("/proj");
    await vfs.write("/proj/uc.ts", v1);

    // Developer implements the @ArchonManual execute() with real logic.
    const devEdited = (await vfs.read("/proj/uc.ts"))!.replace(
      /\/\/ 🖐️[\s\S]*?throw new NotFoundException\('registerAttendee is not implemented yet'\);/,
      "return this.repo.save(this.repo.create(_command)); // PRECIOUS_HUMAN_LOGIC",
    );
    await vfs.write("/proj/uc.ts", devEdited);
    expect(devEdited).toContain("PRECIOUS_HUMAN_LOGIC");

    // Regeneration (e.g. spec changed the return type); merge must not clobber.
    const v2 = await renderTemplate("nestjs/use-case.ts.hbs", useCaseCtx("Promise<void>"));
    const ast = new AstEditor(vfs);
    await ast.mergeTypeScriptContent("/proj/uc.ts", v2);

    const merged = (await vfs.read("/proj/uc.ts"))!;
    expect(merged).toContain("PRECIOUS_HUMAN_LOGIC"); // human logic survives
    expect(merged).not.toContain("registerAttendee is not implemented yet"); // stub not reintroduced
    expect(merged).toContain("class RegisterAttendeeUseCase"); // class intact
  });
});

describe("Feature evolution — SQL schema", () => {
  const renderSchema = (domains: any[]) => renderTemplate("nestjs/db/schema.sql.hbs", { domains });

  it("does not force NOT NULL on nullable columns and is idempotent for evolution", async () => {
    const sql = await renderSchema([
      {
        name: "events",
        entities: [
          {
            name: "Ticket",
            fields: [
              { name: "id", type: "uuid", primary: true },
              { name: "code", type: "string", unique: true },
              { name: "notes", type: "string", nullable: true },
            ],
          },
        ],
      },
    ]);

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "ticket"');
    expect(sql).toContain('"notes" TEXT,'); // nullable -> no NOT NULL
    expect(sql).not.toContain('"notes" TEXT NOT NULL');
    // Idempotent column evolution for pre-existing tables
    expect(sql).toContain('ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "notes" TEXT');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "created_at"');
  });

  it("adds a brand new table when a feature/entity is added (CREATE IF NOT EXISTS)", async () => {
    const sql = await renderSchema([
      {
        name: "events",
        entities: [
          { name: "Ticket", fields: [{ name: "id", type: "uuid", primary: true }] },
          { name: "Coupon", fields: [{ name: "id", type: "uuid", primary: true }, { name: "percent", type: "int" }] },
        ],
      },
    ]);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "ticket"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "coupon"');
    expect(sql).toContain('"percent" INTEGER NOT NULL');
  });
});
