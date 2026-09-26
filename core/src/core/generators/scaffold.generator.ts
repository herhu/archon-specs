import * as path from "path";
import * as fs from "fs-extra";
import { DesignSpec } from '../state/spec';
import { templateEngine } from '../vfs/template-engine';
import { writeArtifact, WriteResult } from '../vfs/io';
import { logger } from '../telemetry/logger';

export async function generateScaffold(
  spec: DesignSpec,
  outDir: string,
  tplDir: string,
  dryRun: boolean,
  context: any,
): Promise<WriteResult[]> {
  logger.debug(`Phase: Scaffolding base app`);
  const results: WriteResult[] = [];
  
  const platformDefaults = { husky: true };
  const platform = { ...platformDefaults, ...(spec.platform || {}) };

  const render = async (src: string, dest: string, ctx: any = context) => {
    const tpl = await fs.readFile(path.join(tplDir, src), "utf-8");
    const content = templateEngine.render(tpl, ctx);
    results.push(await writeArtifact(path.join(outDir, dest), content, dryRun));
  };

  await render("nestjs/package.json.hbs", "package.json", { projectName: spec.name, ...context });
  await render("nestjs/tsconfig.json.hbs", "tsconfig.json");
  await render("nestjs/env.example.hbs", ".env.example", {
    projectName: spec.name,
    jwtIssuer: spec.crossCutting?.auth?.jwt?.issuer,
    jwtAudience: spec.crossCutting?.auth?.jwt?.audience,
    jwtJwksUri: spec.crossCutting?.auth?.jwt?.jwksUri,
    ...context,
  });
  await render("nestjs/gitignore.hbs", ".gitignore");
  await render("nestjs/eslintrc.json.hbs", ".eslintrc.json");
  await render("nestjs/prettierrc.hbs", ".prettierrc");
  await render("nestjs/vscode/launch.json.hbs", ".vscode/launch.json");

  if (platform.husky !== false) {
    await render("nestjs/husky/pre-commit.hbs", ".husky/pre-commit");
    await render("nestjs/husky/prepare-commit-msg.hbs", ".husky/prepare-commit-msg");
  }

  if (platform.jenkins) {
    await render("nestjs/Jenkinsfile.hbs", "Jenkinsfile", { projectName: spec.name, platformConfig: platform, ...context });
  }

  if (platform.frogbot) {
    await render("nestjs/github/frogbot.yml.hbs", ".github/workflows/frogbot.yml");
  }

  if (platform.sonarQube) {
    await render("nestjs/sonar-project.properties.hbs", "sonar-project.properties", { projectName: spec.name });
  }

  if (platform.newRelic) {
    await render("nestjs/newrelic.js.hbs", "newrelic.js", { projectName: spec.name });
  }

  if (platform.terraform) {
    await render("nestjs/infrastructure/main.tf.hbs", "infrastructure/main.tf", { projectName: spec.name });
  }

  if (platform.nginxProxy) {
    await render("nestjs/docker_assets/default.conf.hbs", "docker_assets/default.conf");
    const openapiTpl = await fs.readFile(path.join(tplDir, "nestjs/specs/openapi.yaml.hbs"), "utf-8");
    results.push(await writeArtifact(path.join(outDir, "specs/cert/openapi.yaml"), templateEngine.render(openapiTpl, { projectName: spec.name, env: "cert" }), dryRun));
    results.push(await writeArtifact(path.join(outDir, "specs/prod/openapi.yaml"), templateEngine.render(openapiTpl, { projectName: spec.name, env: "prod" }), dryRun));
  }

  const schemaTpl = await fs.readFile(path.join(tplDir, "nestjs/db/schema.sql.hbs"), "utf-8");
  results.push(await writeArtifact(path.join(outDir, "src/db/schema.sql"), templateEngine.render(schemaTpl, { domains: spec.domains }), dryRun));

  return results;
}

export async function generateReadme(
  spec: DesignSpec,
  outDir: string,
  tplDir: string,
  dryRun: boolean,
): Promise<WriteResult[]> {
  const readmeTpl = await fs.readFile(path.join(tplDir, "nestjs/README.md.hbs"), "utf-8");
  const content = templateEngine.render(readmeTpl, { projectName: spec.name });
  return [await writeArtifact(path.join(outDir, "README.md"), content, dryRun)];
}
