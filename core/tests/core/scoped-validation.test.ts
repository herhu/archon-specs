import { describe, it, expect } from "vitest";
import { VirtualTree } from "../../src/core/vfs/vfs.js";
import { TypescriptParseValidator } from "../../src/core/validators/typescript-parse.validator.js";

describe("Scoped TypeScript validation", () => {
  it("validates only .ts files changed this run", async () => {
    const vfs = new VirtualTree("/proj");
    await vfs.write("/proj/a.ts", "export const a: number = 1;");
    const res = await new TypescriptParseValidator().validate(vfs);
    expect(res.valid).toBe(true);
  });

  it("reports a syntax error in a changed .ts file", async () => {
    const vfs = new VirtualTree("/proj");
    await vfs.write("/proj/bad.ts", "export const x = (;");
    const res = await new TypescriptParseValidator().validate(vfs);
    expect(res.valid).toBe(false);
    expect(res.errors.join("\n")).toMatch(/bad\.ts/);
  });

  it("fast-path: returns valid with no work when no .ts files changed", async () => {
    const vfs = new VirtualTree("/proj");
    await vfs.write("/proj/README.md", "# hi");
    await vfs.write("/proj/schema.sql", "CREATE TABLE x();");
    const res = await new TypescriptParseValidator().validate(vfs);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });
});
