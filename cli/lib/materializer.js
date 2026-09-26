import fs from "fs-extra";
import path from "path";
import { config, sendNotification, JOURNAL_FILE, LINEAGE_FILE, SPEC_FILE } from "./config.js";
import { mergeRegions } from "./regions.js";

/**
 * Enterprise Materializer: Durable, Idempotent, and Resumable
 */
export async function runEnterpriseMaterialization(projectId, outDir, matRes) {
  const { specUrl, planUrl, revisionId, materializationKey } = matRes.result?.structuredContent || {};
  if (!planUrl) {
    const key = materializationKey || projectId;
    const noPlanError = {
      status: "NO_PLAN",
      materializationKey: key,
      cause: "No server-side execution plan exists. This happens when the Pro/manual path was used (DesignSpec.json provided directly, skipping archon_generate_from_uml).",
      fallback: "Use the local CLI to materialize, or call archon_plan_project first to generate a server-side plan.",
      cliCommand: `archon materialize ${key} --outDir ${outDir}`,
      alternativeCommands: [
        `node archon.js generate -s DesignSpec.json -o ${outDir}`,
        `archon generate -s designspec.json -o ${outDir}`
      ]
    };
    console.error(`[Archon] ⚠️  NO_PLAN: ${noPlanError.cause}`);
    console.error(`[Archon] 💡 Fallback: ${noPlanError.cliCommand}`);
    throw Object.assign(new Error(JSON.stringify(noPlanError, null, 2)), { noPlan: true, details: noPlanError });
  }

  console.error(`[Archon] Fetching execution plan from durable storage...`);
  const plan = await (await fetch(planUrl)).json();
  const spec = await (await fetch(specUrl)).json();

  const journalPath = path.join(outDir, JOURNAL_FILE);
  await fs.ensureDir(path.dirname(journalPath));
  
  let journal = { lastSequence: 0, pending: null, revisionId };
  if (fs.existsSync(journalPath)) {
    const existingJournal = await fs.readJSON(journalPath);
    if (existingJournal.revisionId === revisionId) {
      journal = existingJournal;
      console.error(`[Archon] Resuming materialization of ${revisionId} from sequence ${journal.lastSequence}`);
    } else {
      console.error(`[Archon] Starting fresh materialization for new revision ${revisionId}`);
    }
  }

  const totalOps = plan.operations.length;
  let appliedCount = 0;

  console.error(`[Archon] Applying ${totalOps} operations to ${outDir}...`);

  for (const op of plan.operations) {
    // Skip already applied
    if (op.sequence <= journal.lastSequence) continue;

    // 1. Mark Pending
    journal.pending = op.sequence;
    await fs.writeJSON(journalPath, journal);

    // 2. Execute Operation
    const filePath = path.join(outDir, op.path);
    const progress = Math.round((op.sequence / totalOps) * 100);
    console.error(`  [${op.sequence}/${totalOps}] (${progress}%) ${op.type.toUpperCase()}: ${op.path}`);

    try {
      if (op.type === "DELETE_FILE" || op.type === "delete") {
        if (fs.existsSync(filePath)) await fs.remove(filePath);
      } else if (["WRITE_FILE", "CREATE_FILE", "UPDATE_FILE", "create", "update"].includes(op.type)) {
        await fs.ensureDir(path.dirname(filePath));
        let content = op.content || "";
        if (fs.existsSync(filePath)) {
          const oldContent = await fs.readFile(filePath, "utf-8");
          content = mergeRegions(oldContent, content, op.path);
        }
        await fs.writeFile(filePath, content);
      }
    } catch (e) {
      console.error(`  [ERROR] Failed to apply ${op.path}: ${e.message}`);
      throw e;
    }

    // 3. Commit Progress
    journal.lastSequence = op.sequence;
    journal.pending = null;
    await fs.writeJSON(journalPath, journal);
    appliedCount++;

    // 4. Progress Pulse (to remote dashboard)
    if (appliedCount % 5 === 0 || op.sequence === totalOps) {
      await sendNotification("notifications/archon/materialization_progress", {
        projectId,
        revisionId,
        applied: op.sequence,
        total: totalOps,
        currentPath: op.path
      });
    }
  }

  // 5. Finalize Lineage
  const lineagePath = path.join(outDir, LINEAGE_FILE);
  await fs.writeJSON(lineagePath, {
    projectId,
    revisionId,
    materializedAt: new Date().toISOString(),
    status: "success"
  }, { spaces: 2 });

  await fs.writeJSON(path.join(outDir, SPEC_FILE), spec, { spaces: 2 });
  
  return { appliedCount, revisionId };
}
