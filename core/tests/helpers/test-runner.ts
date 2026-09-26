import * as path from "path";
import * as fs from "fs-extra";
import { templateEngine } from "../../src/core/template-engine.js";

export async function renderTemplate(templatePath: string, context: any): Promise<string> {
  // Resolve template path (handle relative to project root)
  const fullPath = path.isAbsolute(templatePath) 
    ? templatePath 
    : path.join(__dirname, "../../src/templates", templatePath);
  
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Template not found: ${fullPath}`);
  }

  const template = await fs.readFile(fullPath, "utf-8");
  return templateEngine.render(template, context);
}

/**
 * Utility to verify that certain strings are present in the rendered output
 */
export function expectToContain(output: string, expected: string | string[]) {
  const targets = Array.isArray(expected) ? expected : [expected];
  for (const target of targets) {
    if (!output.includes(target)) {
      throw new Error(`Expected output to contain: ${target}\n\nActual output:\n${output}`);
    }
  }
}

/**
 * Utility to verify that certain strings are NOT present in the rendered output
 */
export function expectNotToContain(output: string, forbidden: string | string[]) {
  const targets = Array.isArray(forbidden) ? forbidden : [forbidden];
  for (const target of targets) {
    if (output.includes(target)) {
      throw new Error(`Expected output NOT to contain: ${target}\n\nActual output:\n${output}`);
    }
  }
}
