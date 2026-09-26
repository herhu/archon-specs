import * as path from "path";
import * as fs from "fs-extra";
import { DesignSpec } from '../state/spec';
import { WriteResult } from '../vfs/io';
import { logger } from '../telemetry/logger';
import { ChangePlan, ChangePlanner } from './change-planner';
import * as gen from '../generators/index';
import { templateEngine } from '../vfs/template-engine';

export async function generateApp(
  spec: DesignSpec,
  outDir: string,
  dryRun: boolean = false,
  oldSpec: DesignSpec | null = null,
) {
  const plan = ChangePlanner.planChanges(oldSpec, spec);
  return await applyPlan(plan, spec, outDir, dryRun, oldSpec);
}

export async function applyPlan(
  plan: ChangePlan,
  spec: DesignSpec,
  outDir: string,
  dryRun: boolean = false,
  oldSpec: DesignSpec | null = null,
): Promise<WriteResult[]> {
  // ⚙️ Configure Template Engine with Market Helpers
  templateEngine.configure(spec);

  // Robust template path resolution
  let templatesDir = path.join(__dirname, "../../templates");
  if (!fs.existsSync(templatesDir)) templatesDir = path.join(__dirname, "../../../src/templates");
  if (!fs.existsSync(templatesDir)) templatesDir = path.join(__dirname, "../../../templates");

  logger.info({ planMode: plan.mode, deltas: plan.deltas.length, outDir, dryRun }, `Applying Generation Plan`);

  if (!fs.existsSync(templatesDir)) throw new Error("Templates directory not found");

  // Prepare context
  const modules = spec.modules || [];
  const hasRedis = modules.some((m) => m.type === "cache.redis");
  const hasQueue = modules.some((m) => m.type === "queue.bullmq");
  const injectedModules: { className: string; importPath: string }[] = [];
  if (hasRedis) injectedModules.push({ className: "RedisModule", importPath: "./modules/core/redis/redis.module.js" });
  if (hasQueue) injectedModules.push({ className: "QueueModule", importPath: "./modules/core/queue/queue.module.js" });

  const context: gen.GenerationContext = {
    hasRedis,
    hasQueue,
    injectedModules,
    projectName: spec.name,
    apiPrefix: "api/v1",
  };

  const results: WriteResult[] = [];
  let artifactsToProcess = plan.artifacts;

  if (plan.mode === "full") {
    artifactsToProcess = [
      { kind: "scaffold-root" },
      { kind: "docker-root" },
      { kind: "auth-root" },
      { kind: "readme-root" },
      ...spec.domains.map(d => ({ kind: "domain-root", domain: d.key } as const)),
      { kind: "platform-root" },
      { kind: "docs-root" },
      { kind: "scripts-root" },
      { kind: "lineage-root" },
      { kind: "migration" },
    ];
  }

  for (const art of artifactsToProcess) {
    switch (art.kind) {
      case "scaffold-root":
        results.push(...await gen.generateScaffold(spec, outDir, templatesDir, dryRun, context));
        results.push(...await gen.generateInjectedModules(spec, outDir, templatesDir, dryRun, context));
        break;
      case "docker-root":
        results.push(...await gen.generateDocker(spec, outDir, templatesDir, dryRun, context));
        break;
      case "auth-root":
        results.push(...await gen.generateAuth(outDir, templatesDir, dryRun, context));
        break;
      case "readme-root":
        results.push(...await gen.generateReadme(spec, outDir, templatesDir, dryRun));
        break;
      case "domain-root": {
        const domain = spec.domains.find(d => d.key === art.domain);
        if (domain) results.push(...await gen.generateDomain(domain, outDir, templatesDir, dryRun, spec));
        break;
      }
      case "domain-module": {
        const domain = spec.domains.find(d => d.key === art.domain);
        if (domain) results.push(await gen.generateDomainModuleArtifact(domain, outDir, templatesDir, dryRun));
        break;
      }
      case "entity": {
        const domain = spec.domains.find(d => d.key === art.domain);
        const entity = domain?.entities.find(e => e.name === art.entity);
        if (domain && entity) results.push(await gen.generateEntityArtifact(domain, entity, outDir, templatesDir, dryRun, spec));
        break;
      }
      case "dto": {
        const domain = spec.domains.find(d => d.key === art.domain);
        const entity = domain?.entities.find(e => e.name === art.entity);
        if (domain && entity) results.push(await gen.generateDtoArtifact(domain, entity, outDir, templatesDir, dryRun));
        break;
      }
      case "service": {
        const domain = spec.domains.find(d => d.key === art.domain);
        const service = domain?.services.find(s => s.name === art.service);
        if (domain && service) results.push(await gen.generateServiceArtifact(domain, service, outDir, templatesDir, dryRun, spec));
        break;
      }
      case "controller": {
        const domain = spec.domains.find(d => d.key === art.domain);
        const service = domain?.services.find(s => s.name === art.service);
        if (domain && service) results.push(await gen.generateControllerArtifact(domain, service, outDir, templatesDir, dryRun));
        break;
      }
      case "platform-root":
        results.push(...await gen.generatePlatform(spec, outDir, templatesDir, dryRun, context));
        break;
      case "docs-root":
        results.push(...await gen.generateDocs(spec, outDir, templatesDir, dryRun, context));
        break;
      case "scripts-root":
        results.push(...await gen.generateScripts(spec, outDir, templatesDir, dryRun, context));
        break;
      case "lineage-root":
        results.push(await gen.generateLineageManifest(spec, outDir, templatesDir, dryRun));
        break;
      case "migration":
        results.push(...await gen.generateMigrationArtifact(spec, outDir, templatesDir, dryRun, plan.deltas, oldSpec));
        break;
    }
  }

  logger.info({
    projectName: spec.name,
    totalResults: results.length,
    skipped: results.filter(r => r.status === 'skipped').length,
    created: results.filter(r => r.status === 'created').length,
    updated: results.filter(r => r.status === 'updated').length,
  }, `Generation completed`);

  return results;
}

// Re-export lineage verification for external callers
export { verifyLineage } from '../generators/lineage.generator';
