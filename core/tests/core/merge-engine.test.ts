import { describe, it, expect } from "vitest";
import { VirtualTree } from "../../src/core/vfs/vfs.js";
import { AstEditor } from "../../src/core/vfs/ast-editor.js";

// E0 increment 2 — merge-engine surgery that unblocks E3/E5 without breaking the
// lineage guarantee. Two verified gaps from the eng review:
//   (1) mergeTypeScriptContent never reconciled constructor params → injected
//       use-cases/ports silently failed to wire on regen of existing projects.
//   (2) ensureArrayItem used text-equality → object-literal providers duplicated
//       on every regen.
// All changes are ADDITIVE / idempotent.

describe("merge-engine — constructor parameter reconciliation", () => {
  it("adds a new DI param to an existing constructor, keeps the old one, idempotent", async () => {
    const vfs = new VirtualTree("/p");
    await vfs.write(
      "/p/foo.controller.ts",
      `export class FooController {\n  constructor(private readonly service: FooService) {}\n}\n`,
    );
    const ast = new AstEditor(vfs);

    const regen = `export class FooController {\n  constructor(private readonly service: FooService, private readonly placeOrder: PlaceOrderUseCase) {}\n}\n`;
    await ast.mergeTypeScriptContent("/p/foo.controller.ts", regen);

    let out = (await vfs.read("/p/foo.controller.ts"))!;
    expect(out).toContain("service: FooService"); // old param survives
    expect(out).toContain("placeOrder: PlaceOrderUseCase"); // new param wired

    // Idempotent: a second identical merge must not duplicate the param.
    await ast.mergeTypeScriptContent("/p/foo.controller.ts", regen);
    out = (await vfs.read("/p/foo.controller.ts"))!;
    expect(out.match(/placeOrder: PlaceOrderUseCase/g)!.length).toBe(1);
  });

  it("adds a constructor when the target class has none", async () => {
    const vfs = new VirtualTree("/p");
    await vfs.write("/p/bar.service.ts", `export class BarService {\n  foo = 1;\n}\n`);
    const ast = new AstEditor(vfs);

    await ast.mergeTypeScriptContent(
      "/p/bar.service.ts",
      `export class BarService {\n  constructor(private readonly repo: BarRepository) {}\n}\n`,
    );
    const out = (await vfs.read("/p/bar.service.ts"))!;
    expect(out).toContain("repo: BarRepository");
  });

  it("does NOT touch a constructor inside an @ArchonManual class", async () => {
    const vfs = new VirtualTree("/p");
    await vfs.write(
      "/p/manual.ts",
      `@ArchonManual()\nexport class ManualService {\n  constructor(private readonly a: A) {}\n}\n`,
    );
    const ast = new AstEditor(vfs);
    await ast.mergeTypeScriptContent(
      "/p/manual.ts",
      `export class ManualService {\n  constructor(private readonly a: A, private readonly b: B) {}\n}\n`,
    );
    const out = (await vfs.read("/p/manual.ts"))!;
    expect(out).not.toContain("b: B"); // manual ownership respected
  });
});

describe("merge-engine — provider idempotency (ensureArrayItem)", () => {
  const moduleSrc = `import { Module } from '@nestjs/common';\n@Module({ providers: [] })\nexport class CatalogModule {}\n`;
  const locator = { decoratorName: "Module", propertyName: "providers" };

  it("dedupes object-literal providers by their provide: token across whitespace", async () => {
    const vfs = new VirtualTree("/p");
    await vfs.write("/p/catalog.module.ts", moduleSrc);
    const ast = new AstEditor(vfs);

    await ast.ensureArrayItem("/p/catalog.module.ts", locator, "{ provide: PRODUCT_REPOSITORY, useClass: TypeOrmProductRepository }");
    // Same provider, different spacing — must NOT add a second entry.
    await ast.ensureArrayItem("/p/catalog.module.ts", locator, "{ provide:PRODUCT_REPOSITORY, useClass: TypeOrmProductRepository }");

    const out = (await vfs.read("/p/catalog.module.ts"))!;
    expect(out.match(/provide\s*:\s*PRODUCT_REPOSITORY/g)!.length).toBe(1);
  });

  it("still adds a provider with a different provide: token", async () => {
    const vfs = new VirtualTree("/p");
    await vfs.write("/p/catalog.module.ts", moduleSrc);
    const ast = new AstEditor(vfs);

    await ast.ensureArrayItem("/p/catalog.module.ts", locator, "{ provide: PRODUCT_REPOSITORY, useClass: TypeOrmProductRepository }");
    await ast.ensureArrayItem("/p/catalog.module.ts", locator, "{ provide: ORDER_REPOSITORY, useClass: TypeOrmOrderRepository }");

    const out = (await vfs.read("/p/catalog.module.ts"))!;
    expect(out).toContain("PRODUCT_REPOSITORY");
    expect(out).toContain("ORDER_REPOSITORY");
  });

  it("preserves plain-symbol text-equality behavior", async () => {
    const vfs = new VirtualTree("/p");
    await vfs.write("/p/catalog.module.ts", moduleSrc);
    const ast = new AstEditor(vfs);
    await ast.ensureArrayItem("/p/catalog.module.ts", locator, "ProductService");
    await ast.ensureArrayItem("/p/catalog.module.ts", locator, "ProductService");
    const out = (await vfs.read("/p/catalog.module.ts"))!;
    expect(out.match(/ProductService/g)!.length).toBe(1);
  });
});
