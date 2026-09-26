import { describe, it, expect, vi } from "vitest";
import { RegionManager } from "../../src/core/region-manager.js";
import { logger } from "../../src/core/logger.js";

describe("RegionManager Robustness", () => {
  it("should log a warning if a comment-based region is missing its target marker", () => {
    const oldContent = `
// @archon-manual-start:custom-logic
console.log("valuable code");
// @archon-manual-end
`;
    const newContent = `
export class MyService {}
`;
    
    const warnSpy = vi.spyOn(logger, 'warn');
    const merged = RegionManager.merge(oldContent, newContent, "test.ts");

    expect(merged).toBe(newContent);
    expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Manual region 'custom-logic' from existing file could not be merged into new content in test.ts. The target marker or method may be missing.")
    );
  });

  it("should log a warning if a decorated method is missing from new content (and fallback fails)", () => {
    const oldContent = `
export class MyService {
    @ArchonManual()
    async myMethod() { return 1; }
}
`;
    // New content has NEITHER the method NOR the 'methods' manual region for fallback
    const newContent = `
export class MyService {}
`;
    
    const warnSpy = vi.spyOn(logger, 'warn');
    const merged = RegionManager.merge(oldContent, newContent, "test.ts");

    expect(merged).toBe(newContent);
    expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Manual region 'decorator:myMethod' from existing file could not be merged into new content in test.ts. The target marker or method may be missing.")
    );
  });

  it("should successfully fallback to 'methods' region for missing decorated methods", () => {
      const oldContent = `
export class MyService {
    @ArchonManual()
    async myNewMethod() { return "new"; }
}
`;
    const newContent = `
export class MyService {
    // @archon-manual-start:methods
    // @archon-manual-end
}
`;
    
    const debugSpy = vi.spyOn(logger, 'debug');
    const merged = RegionManager.merge(oldContent, newContent, "test.ts");

    expect(merged).toContain("async myNewMethod()");
    expect(merged).toContain('return "new"');
    expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining("Merged 1/1 manual regions in test.ts.")
    );
  });
});
