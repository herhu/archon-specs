import * as path from "path";
import * as fs from "fs-extra";
import * as crypto from "crypto";
import { toKebabCase, toCamelCase, toSnakeCase } from '../vfs/template-engine';
import { Service, Entity } from '../state/spec';

export function toKebab(s: string) {
  return toKebabCase(s.replace(/Service$/, ""));
}

export function kebab(str: string) {
  return toKebabCase(str);
}

export function normalizeService(service: Service) {
  const baseName = service.name.replace(/Service$/, ""); // PascalCase name
  const fileBase = toKebab(baseName); // kebab-case for filenames

  return {
    baseName,
    fileBase,
    serviceClassName: `${baseName}Service`,
    serviceFileName: `${fileBase}.service`,
    controllerClassName: `${baseName}Controller`,
    controllerFileName: `${fileBase}.controller`,
    importPathService: `./services/${fileBase}.service`,
    importPathController: `./controllers/${fileBase}.controller`,
  };
}

export async function hashDirectory(directory: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const files = await getFilesRecursive(directory);

  for (const file of files.sort()) {
    const content = await fs.readFile(file);
    hash.update(path.relative(directory, file));
    hash.update(content);
  }

  return hash.digest("hex");
}

export async function getFilesRecursive(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((res) => {
      const resPath = path.resolve(directory, res.name);
      return res.isDirectory() ? getFilesRecursive(resPath) : [resPath];
    }),
  );
  return Array.prototype.concat(...files);
}

export function exampleBodyForCrud(entity: Entity) {
  const ex: Record<string, any> = {};
  for (const f of entity?.fields ?? []) {
    const name = f.name;
    if (name === entity.primaryKey) continue;

    switch (f.type) {
      case "boolean":
        ex[name] = true;
        break;
      case "int":
      case "float":
        ex[name] = 1;
        break;
      case "timestamp":
        ex[name] = new Date().toISOString();
        break;
      case "json":
        ex[name] = { example: true };
        break;
      default:
        ex[name] = `example_${name}`;
    }
  }
  return ex;
}

export function curlForEndpoint(ep: {
  method: string;
  path: string;
  authRequired: boolean;
  scope: string;
  body?: any;
}) {
  const base = `curl -X ${ep.method} "{{baseUrl}}${ep.path}"`;
  const headers: string[] = [];
  if (ep.authRequired) headers.push(`-H "Authorization: Bearer {{token}}"`);
  if (ep.body) headers.push(`-H "Content-Type: application/json"`);

  const body = ep.body ? ` \\\n  -d '${JSON.stringify(ep.body, null, 2)}'` : "";
  const headerLines = headers.length ? " \\\n  " + headers.join(" \\\n  ") : "";
  return `${base}${headerLines}${body}`;
}
