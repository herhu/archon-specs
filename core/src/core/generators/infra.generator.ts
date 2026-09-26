import * as path from "path";
import * as fs from "fs-extra";
import { DesignSpec } from '../state/spec';
import { templateEngine } from '../vfs/template-engine';
import { writeArtifact, WriteResult } from '../vfs/io';
import { logger } from '../telemetry/logger';

export async function generateInjectedModules(
  spec: DesignSpec,
  outDir: string,
  tplDir: string,
  dryRun: boolean,
  context: any = {},
): Promise<WriteResult[]> {
  logger.debug(`Phase: Generating Injected Modules (Redis/Queue)`);
  const results: WriteResult[] = [];
  if (!spec.modules || spec.modules.length === 0) return results;

  for (const mod of spec.modules) {
    if (mod.type === "cache.redis") {
      const tpl = await fs.readFile(path.join(tplDir, "modules/redis/redis.module.ts.hbs"), "utf-8");
      results.push(await writeArtifact(
        path.join(outDir, "src/modules/core/redis/redis.module.ts"),
        templateEngine.render(tpl, { config: mod.config }),
        dryRun,
      ));
    } else if (mod.type === "queue.bullmq") {
      const tpl = await fs.readFile(path.join(tplDir, "modules/queue/queue.module.ts.hbs"), "utf-8");
      results.push(await writeArtifact(
        path.join(outDir, "src/modules/core/queue/queue.module.ts"),
        templateEngine.render(tpl, { config: mod.config }),
        dryRun,
      ));
    }
  }
  return results;
}

export async function generateDocker(
  spec: DesignSpec,
  outDir: string,
  tplDir: string,
  dryRun: boolean,
  context: any = {},
): Promise<WriteResult[]> {
  logger.debug(`Phase: Generating Docker assets`);
  const results: WriteResult[] = [];

  const render = async (src: string, dest: string) => {
    const tpl = await fs.readFile(path.join(tplDir, src), "utf-8");
    results.push(await writeArtifact(path.join(outDir, dest), templateEngine.render(tpl, context), dryRun));
  };

  await render("nestjs/Dockerfile.hbs", "Dockerfile");
  await render("nestjs/dockerignore.hbs", ".dockerignore");
  await render("nestjs/env.docker.hbs", ".env.docker");
  await render("nestjs/docker-compose.yml.hbs", "docker-compose.yml");

  return results;
}
