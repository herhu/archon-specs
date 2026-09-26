import * as path from "path";
import * as fs from "fs-extra";
import { DesignSpec } from '../state/spec';
import { computeSpecFingerprint } from '../state/fingerprint';
import { templateEngine } from '../vfs/template-engine';
import { writeArtifact, WriteResult } from '../vfs/io';
import { exampleBodyForCrud, curlForEndpoint } from './util';

export async function generateDocs(
  spec: DesignSpec,
  outDir: string,
  tplDir: string,
  dryRun: boolean,
  context: any = {},
): Promise<WriteResult[]> {
  const results: WriteResult[] = [];
  const docsDir = path.join(outDir, "docs");
  const endpoints = buildEndpoints(spec);

  const apiTpl = await fs.readFile(path.join(tplDir, "docs/api.md.hbs"), "utf-8");
  results.push(await writeArtifact(path.join(docsDir, "api.md"), templateEngine.render(apiTpl, {
    projectName: spec.name,
    baseUrl: "{{baseUrl}}",
    token: "{{token}}",
    tokenUrl: "{{tokenUrl}}",
    clientId: "{{clientId}}",
    clientSecret: "{{clientSecret}}",
    scope: "{{scope}}",
    endpoints,
  }), dryRun));

  const homeTpl = await fs.readFile(path.join(tplDir, "docs/governance.md.hbs"), "utf-8");
  results.push(await writeArtifact(path.join(outDir, "docs/governance.md"), templateEngine.render(homeTpl, { projectName: spec.name }), dryRun));

  const assets = (spec as any).meta?.architecturalAssets || (spec as any).architecturalAssets || [];
  if (assets.length > 0) {
    const archTplPath = path.join(tplDir, "docs/architecture.md.hbs");
    if (fs.existsSync(archTplPath)) {
      const archTpl = await fs.readFile(archTplPath, "utf-8");
      results.push(await writeArtifact(path.join(outDir, "docs/architecture.md"), templateEngine.render(archTpl, {
          projectName: spec.name,
          modelCode: assets[0] || "",
          sequenceCode: assets[1] || "",
          specFingerprint: computeSpecFingerprint(spec)
      }), dryRun));
    }
  }

  return results;
}

function buildEndpoints(spec: DesignSpec) {
  const eps: any[] = [];
  for (const d of spec.domains) {
    const domainKey = d.key;
    const entity = d.entities[0];
    const body = entity ? exampleBodyForCrud(entity) : undefined;

    for (const s of d.services) {
      const route = s.route;
      const crud = new Set(s.crud ?? []);

      const addEp = (method: string, path: string, desc: string, b?: any) => {
        const ep = { method, path: `/${route}${path}`, authRequired: true, scope: `${domainKey}:${method === 'GET' ? 'read' : 'write'}`, description: desc, body: b };
        eps.push({ ...ep, curl: curlForEndpoint(ep) });
      };

      if (crud.has("create")) addEp("POST", "", "Create resource", body);
      if (crud.has("findAll")) addEp("GET", "", "List resources");
      if (crud.has("findOne")) addEp("GET", "/:id", "Get resource by id");
      if (crud.has("update")) addEp("PATCH", "/:id", "Update resource", body);
      if (crud.has("delete")) addEp("DELETE", "/:id", "Delete resource");

      for (const op of s.operations ?? []) {
        const authRequired = op.authz?.required !== false;
        const ep = {
          method: op.method,
          path: `/${route}${op.path}`,
          authRequired,
          scope: authRequired ? (op.authz?.scopesAll?.join(", ") || `${domainKey}:${op.method === "GET" ? "read" : "write"}`) : "-",
          description: `Operation: ${op.name}`,
          body: op.method !== "GET" && op.request?.schemaRef ? { example: "TODO schema ref" } : undefined,
        };
        eps.push({ ...ep, curl: curlForEndpoint(ep) });
      }
    }
  }
  return eps;
}
