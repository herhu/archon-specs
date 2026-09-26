import * as path from "path";
import * as fs from "fs-extra";
import { DesignSpec } from '../state/spec';
import { templateEngine, toPascalCase, toKebabCase } from '../vfs/template-engine';
import { writeArtifact, WriteResult } from '../vfs/io';
import { logger } from '../telemetry/logger';

export async function generatePlatform(
  spec: DesignSpec,
  outDir: string,
  tplDir: string,
  dryRun: boolean,
  extraContext: any = {},
): Promise<WriteResult[]> {
  logger.debug(`Phase: Generating Platform layer (NestJS)`);
  const results: WriteResult[] = [];
  const platform = {
    cors: true, cookieParser: true, securityHeaders: true, swagger: true,
    throttling: true, rateLimitTtl: 60, rateLimitMax: 100, maxBodySize: "1mb",
    ...(spec as any).platform
  };

  const context = {
    platform,
    domainModules: spec.domains.map((d) => ({
      className: toPascalCase(d.key) + "Module",
      importPath: `./modules/${toKebabCase(d.key)}/${toKebabCase(d.key)}.module`,
    })),
    apiPrefix: "api/v1",
    port: 3000,
    projectName: spec.name,
    injectedModules: extraContext.injectedModules || [],
  };

  const render = async (srcRel: string, destRel: string) => {
    const tpl = await fs.readFile(path.join(tplDir, "platform", srcRel), "utf-8");
    results.push(await writeArtifact(path.join(outDir, destRel), templateEngine.render(tpl, context), dryRun));
  };

  await render("main.ts.hbs", "src/main.ts");
  await render("app.module.ts.hbs", "src/app.module.ts");
  await render("shared/config/config.schema.ts.hbs", "src/shared/config/config.schema.ts");
  await render("shared/config/config.module.ts.hbs", "src/shared/config/config.module.ts");
  await render("shared/logging/logger.module.ts.hbs", "src/shared/logging/logger.module.ts");
  await render("shared/logging/pino.options.ts.hbs", "src/shared/logging/pino.options.ts");
  await render("shared/middleware/correlation-id.middleware.ts.hbs", "src/shared/shared/middleware/correlation-id.middleware.ts");
  await render("shared/filters/http-exception.filter.ts.hbs", "src/shared/filters/http-exception.filter.ts");
  await render("shared/interceptors/transform.interceptor.ts.hbs", "src/shared/interceptors/transform.interceptor.ts");
  await render("shared/health/health.module.ts.hbs", "src/shared/health/health.module.ts");
  await render("shared/health/health.controller.ts.hbs", "src/shared/health/health.controller.ts");
  await render("shared/health/health.service.ts.hbs", "src/shared/health/health.service.ts");
  await render("shared/swagger/swagger.ts.hbs", "src/shared/swagger/swagger.ts");

  const decoratorTpl = await fs.readFile(path.join(tplDir, "nestjs/archon-manual.decorator.ts.hbs"), "utf-8");
  results.push(await writeArtifact(path.join(outDir, "src/shared/decorators/archon-manual.decorator.ts"), decoratorTpl, dryRun));

  return results;
}
