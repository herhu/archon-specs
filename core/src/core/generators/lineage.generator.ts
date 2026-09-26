import * as path from "path";
import * as fs from "fs-extra";
import * as crypto from "crypto";
import { DesignSpec } from '../state/spec';
import { SpecMutator } from '../state/spec-mutator';
import { writeArtifact, WriteResult } from '../vfs/io';
import { LineageManifest } from './types';
import { hashDirectory } from './util';

export async function generateLineageManifest(
  spec: DesignSpec,
  outDir: string,
  tplDir: string,
  dryRun: boolean,
): Promise<WriteResult> {
  const normalizedSpec = SpecMutator.normalizeSpec(spec);
  const specContent = JSON.stringify(normalizedSpec, null, 2);
  const specHash = crypto.createHash("sha256").update(specContent).digest("hex");

  const templatesHash = await hashDirectory(tplDir);

  const manifest: LineageManifest = {
    lineageVersion: "2.0",
    projectId: spec.projectId || `proj_${crypto.createHash('md5').update(spec.name || 'unknown').digest('hex').substring(0, 8)}`,
    revisionId: spec.revisionId || new Date().toISOString().replace(/[:.]/g, '-'),
    lineageId: `lin_${crypto.randomBytes(4).toString("hex")}`,
    generatorVersion: "1.0.0",
    templateSetVersion: spec.platform?.swagger ? "nestjs-v2" : "nestjs-v1",
    specHash,
    templatesHash,
    generatedAt: new Date().toISOString(),
    metadata: {
      specName: spec.name,
      targetDir: outDir,
      platform: spec.platform?.swagger ? "nestjs" : "basic",
    },
  };

  return await writeArtifact(
    path.join(outDir, ".archon/lineage.json"),
    JSON.stringify(manifest, null, 2),
    dryRun,
  );
}

export async function verifyLineage(
  spec: DesignSpec,
  outDir: string,
  tplDir: string,
): Promise<{ valid: boolean; errors: string[] }> {
  const manifestPath = path.join(outDir, ".archon/lineage.json");
  if (!fs.existsSync(manifestPath)) {
    return { valid: false, errors: ["Lineage manifest missing"] };
  }

  const manifest: LineageManifest = await fs.readJson(manifestPath);
 
  const normalizedSpec = SpecMutator.normalizeSpec(spec);
  const specContent = JSON.stringify(normalizedSpec, null, 2);
  const currentSpecHash = crypto.createHash("sha256").update(specContent).digest("hex");
  const currentTemplatesHash = await hashDirectory(tplDir);

  const errors: string[] = [];
  if (currentSpecHash !== manifest.specHash) {
    errors.push("Spec hash mismatch: The current spec does not match the one used for generation.");
  }
  if (currentTemplatesHash !== manifest.templatesHash) {
    errors.push("Templates hash mismatch: The generator templates have changed.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
