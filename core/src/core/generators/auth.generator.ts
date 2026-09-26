import * as path from "path";
import * as fs from "fs-extra";
import { templateEngine } from '../vfs/template-engine';
import { writeArtifact, WriteResult } from '../vfs/io';
import { logger } from '../telemetry/logger';

export async function generateAuth(
  outDir: string,
  tplDir: string,
  dryRun: boolean,
  context: any = {},
): Promise<WriteResult[]> {
  logger.debug(`Phase: Generating Auth modules`);
  const results: WriteResult[] = [];
  const authDir = path.join(outDir, "src/auth");

  const render = async (srcRel: string, destRel: string) => {
    const tpl = await fs.readFile(path.join(tplDir, "nestjs/auth", srcRel), "utf-8");
    const content = templateEngine.render(tpl, context);
    results.push(await writeArtifact(path.join(authDir, destRel), content, dryRun));
  };

  await render("auth.module.ts.hbs", "auth.module.ts");
  await render("jwt.config.ts.hbs", "jwt.config.ts");
  await render("jwt.guard.ts.hbs", "jwt.guard.ts");
  await render("scopes.decorator.ts.hbs", "scopes.decorator.ts");
  await render("scopes.guard.ts.hbs", "scopes.guard.ts");
  
  return results;
}
