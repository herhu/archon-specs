import { describe, it, expect } from "vitest";
import { templateEngine } from "../../src/core/vfs/template-engine.js";
import { normalizeRenderContext } from "../../src/core/vfs/context-normalizer.js";

describe("HandleArchon Profile", () => {
  it("strict (code) render throws a located error on an unresolved variable", () => {
    expect(() =>
      templateEngine.render("return (dto as any).{{idName}};", { entity: { name: "Ticket" } }, { strict: true }),
    ).toThrowError(/HandleArchon.*\{\{idName\}\}.*Ticket/s);
  });

  it("lenient (leaf) render tolerates intentional placeholders", () => {
    expect(templateEngine.render("JWT_ISSUER={{jwtIssuer}}", {}, { strict: false })).toBe("JWT_ISSUER=");
  });

  it("does not HTML-escape output (noEscape) — code values stay raw", () => {
    expect(templateEngine.render("x = {{v}}", { v: "'hi' & <ok>" })).toBe("x = 'hi' & <ok>");
  });

  it("normalizes baseline keys (projectName from name, port, apiPrefix)", () => {
    const c = normalizeRenderContext({ name: "Conf API" });
    expect(c.projectName).toBe("Conf API");
    expect(c.port).toBe(3000);
    expect(c.apiPrefix).toBe("api/v1");
    // explicit values win over defaults
    expect(normalizeRenderContext({ name: "X", port: 8080 }).port).toBe(8080);
  });

  it("caches compiled templates (same template renders consistently)", () => {
    const t = "hello {{who}}";
    expect(templateEngine.render(t, { who: "a" })).toBe("hello a");
    expect(templateEngine.render(t, { who: "b" })).toBe("hello b");
  });
});
