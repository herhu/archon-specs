import * as path from "path";
import * as fs from "fs-extra";
import { DesignSpec } from '../state/spec';
import { templateEngine } from '../vfs/template-engine';
import { writeArtifact, WriteResult } from '../vfs/io';
import { logger } from '../telemetry/logger';

export async function generateScripts(
  spec: DesignSpec,
  outDir: string,
  tplDir: string,
  dryRun: boolean,
  context: any = {},
): Promise<WriteResult[]> {
  logger.debug(`Phase: Generating Utility Scripts`);
  const results: WriteResult[] = [];
  const scriptsDir = path.join(outDir, "scripts");

  const tokenUrl = spec.crossCutting?.auth?.jwt?.issuer
    ? `${spec.crossCutting.auth.jwt.issuer}/oauth/token`
    : "YOUR_TOKEN_URL";

  const render = async (src: string, dest: string, ctx: any = context) => {
    const tpl = await fs.readFile(path.join(tplDir, src), "utf-8");
    results.push(await writeArtifact(path.join(outDir, dest), templateEngine.render(tpl, ctx), dryRun));
  };

  await render("scripts/get-token.sh.hbs", "scripts/get-token.sh", {
    tokenUrl,
    clientId: "YOUR_CLIENT_ID",
    clientSecret: "YOUR_CLIENT_SECRET",
    audience: spec.crossCutting?.auth?.jwt?.audience ?? "YOUR_AUDIENCE",
    defaultScopes: spec.crossCutting?.auth?.jwt?.defaultScopes ?? "openid profile",
  });
  await render("scripts/curl.sh.hbs", "scripts/curl.sh");
  await render("scripts/docker-up.sh.hbs", "scripts/docker-up.sh");
  await render("scripts/docker-down.sh.hbs", "scripts/docker-down.sh");
  await render("scripts/ARCHON.sh.hbs", "ARCHON.sh");

  const platform = { husky: true, ...(spec.platform || {}) };
  if (platform.husky !== false) {
    await render("scripts/branch-to-commit-message.sh.hbs", "scripts/branch-to-commit-message.sh");
  }

  if (!dryRun) {
    try {
      const execs = ["scripts/get-token.sh", "scripts/curl.sh", "scripts/docker-up.sh", "scripts/docker-down.sh", "ARCHON.sh"];
      if (platform.husky !== false) execs.push("scripts/branch-to-commit-message.sh", ".husky/pre-commit", ".husky/prepare-commit-msg");
      for (const p of execs) await fs.chmod(path.join(outDir, p), "755").catch(() => {});
      
      const migrateTpl = await fs.readFile(path.join(tplDir, "scripts/db-migrate.ts.hbs"), "utf-8");
      results.push(await writeArtifact(path.join(outDir, "scripts/db-migrate.ts"), migrateTpl, dryRun));
    } catch (e) {}
  }
  return results;
}
