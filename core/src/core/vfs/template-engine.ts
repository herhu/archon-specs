import * as Handlebars from "handlebars";
import { registerMarketHelpers } from "./helpers/registry";
import { normalizeRenderContext } from "./context-normalizer";
import { DesignSpec } from "../state/spec";

// Casing utilities
export function toKebabCase(str: string) {
  if (!str) return "";
  return str
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

export function toPascalCase(str: string) {
  if (!str) return "";
  return (
    str
      .match(/[a-z0-9]+/gi)
      ?.map(
        (word) => word.charAt(0).toUpperCase() + word.toLowerCase().slice(1),
      )
      .join("") || ""
  );
}

export function toCamelCase(str: string) {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function toSnakeCase(str: string) {
  return toKebabCase(str).replace(/-/g, "_");
}

export class TemplateEngine {
  private hbs: typeof Handlebars;
  // Compiled-template cache: skip re-parsing identical templates across the
  // many files generated in one run (first step toward full precompilation).
  private compiledCache = new Map<string, Handlebars.TemplateDelegate>();
  // Strict mode is toggled per-render (code = strict, leaf files = lenient).
  private strictMode = false;

  constructor() {
    this.hbs = Handlebars.create();
    this.registerHelpers();
  }

  private registerHelpers() {
    this.hbs.registerHelper("lower", (str) => String(str).toLowerCase());
    this.hbs.registerHelper(
      "capitalize",
      (str) => String(str).charAt(0).toUpperCase() + String(str).slice(1),
    );
    this.hbs.registerHelper("kebab", (str) => toKebabCase(String(str)));
    this.hbs.registerHelper("pascal", (str) => toPascalCase(String(str)));
    this.hbs.registerHelper("camel", (str) => toCamelCase(String(str)));
    this.hbs.registerHelper("snake", (str) => toSnakeCase(String(str)));
    this.hbs.registerHelper("eq", (a, b) => a === b);
    this.hbs.registerHelper("or", (...args) => args.slice(0, -1).some(Boolean));
    this.hbs.registerHelper("and", (...args) => args.slice(0, -1).every(Boolean));
    this.hbs.registerHelper("not", (val) => !val);
    this.hbs.registerHelper("contains", (str, sub) => String(str).includes(String(sub)));
    this.hbs.registerHelper("nestjsMethod", (method) => {
      switch (String(method).toUpperCase()) {
        case "GET":
          return "Get";
        case "POST":
          return "Post";
        case "PUT":
          return "Put";
        case "PATCH":
          return "Patch";
        case "DELETE":
          return "Delete";
        default:
          return "Get";
      }
    });

    // Map a DSL field type to its TypeScript type.
    this.hbs.registerHelper("tsType", (type) => {
      switch (String(type).toLowerCase()) {
        case "int":
        case "float":
        case "number":
          return "number";
        case "boolean":
          return "boolean";
        case "timestamp":
          return "Date";
        case "json":
          return "Record<string, any>";
        default:
          return "string";
      }
    });

    // Map a DSL field type to a Postgres column type.
    this.hbs.registerHelper("sqlType", (type) => {
      switch (String(type).toLowerCase()) {
        case "int":
          return "INTEGER";
        case "float":
          return "DOUBLE PRECISION";
        case "uuid":
          return "UUID";
        case "boolean":
          return "BOOLEAN";
        case "timestamp":
          return "TIMESTAMP WITH TIME ZONE";
        case "json":
          return "JSONB";
        default:
          return "TEXT";
      }
    });

    // Produce a realistic Swagger example literal for a field (type + name aware).
    this.hbs.registerHelper("apiExample", (type, name) => {
      const n = String(name || "").toLowerCase();
      switch (String(type).toLowerCase()) {
        case "uuid":
          return "'3fa85f64-5717-4562-b3fc-2c963f66afa6'";
        case "int":
        case "float":
        case "number":
          return n.includes("price") || n.includes("amount") ? "9.99" : "1";
        case "boolean":
          return "true";
        case "timestamp":
          return "'2025-01-01T12:00:00.000Z'";
        case "json":
          return "{}";
        default:
          if (n.includes("email")) return "'user@example.com'";
          if (n.includes("name")) return "'John Doe'";
          if (n.includes("url")) return "'https://example.com'";
          if (n.includes("phone")) return "'+1-555-0100'";
          if (n.includes("status")) return "'active'";
          return "'example'";
      }
    });

    // 🛡️ HandleArchon fail-loud: a bare `{{missingValue}}` (not a helper, not a
    // context property) would otherwise render as an empty string and silently
    // emit broken code (e.g. the `(dto as any).` bug). In strict (code) renders
    // we throw with a locating message; in lenient (leaf-file) renders we keep
    // stock behavior so intentional placeholders stay empty. Either way, a
    // missing *helper call* (with args) always throws, matching Handlebars.
    const self = this;
    this.hbs.registerHelper("helperMissing", function (this: any, ...args: any[]) {
      const options = args[args.length - 1] || {};
      const name = options.name || "<unknown>";
      const hasParams = args.length > 1;
      if (!self.strictMode && !hasParams) return ""; // lenient: intentional placeholder
      const ctx = this && typeof this === "object" ? this : {};
      const label = ctx.entity?.name || ctx.service?.name || ctx.serviceClassName || ctx.projectName || "template";
      const keys = Object.keys(ctx).slice(0, 12).join(", ");
      throw new Error(
        `[HandleArchon] Unresolved '{{${name}}}' while rendering "${label}". ` +
          `It is neither a registered helper nor a property of the current context. ` +
          `Available context keys: [${keys}]. ` +
          `Fix the template variable or ensure the generator provides '${name}'.`,
      );
    });

    console.error(`[TRACE:ARCHON:template-engine] Base engine initialized with ${Object.keys(this.hbs.helpers).length} helpers.`);
  }

  public configure(spec: DesignSpec) {
    if (spec.handlebarsHelpers && spec.handlebarsHelpers.length > 0) {
        console.error(`[TRACE:ARCHON:template-engine] Injecting market helpers: ${spec.handlebarsHelpers.join(", ")}`);
        registerMarketHelpers(this.hbs, spec.handlebarsHelpers);
        console.error(`[TRACE:ARCHON:template-engine] Total helpers after injection: ${Object.keys(this.hbs.helpers).length}`);
    }
  }

  /**
   * @param opts.strict when true (code generation), an unresolved `{{var}}`
   *        throws instead of rendering empty. Leaf/text files pass false.
   */
  public render(template: string, context: any, opts: { strict?: boolean } = {}): string {
    let compiled = this.compiledCache.get(template);
    if (!compiled) {
      // noEscape: we generate source code, never HTML — values must be raw
      // (this is why `{{x}}` used to corrupt code into `&#x27;`).
      compiled = this.hbs.compile(template, { noEscape: true });
      this.compiledCache.set(template, compiled);
    }
    this.strictMode = !!opts.strict;
    try {
      return compiled(normalizeRenderContext(context));
    } finally {
      this.strictMode = false;
    }
  }
}

export const templateEngine = new TemplateEngine();
