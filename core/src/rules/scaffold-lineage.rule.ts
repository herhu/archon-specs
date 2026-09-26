import { ArchonRule, RulePhase } from './archon-rule';
import { RuleResult } from './rule-result';
import { ExecutionContext } from '../core/engine/execution-context';
import * as crypto from 'crypto';

function normalizeSpec(spec: any): any {
    // Basic normalization: sort keys deeply so hash is stable
    if (!spec || typeof spec !== 'object') return spec;
    if (Array.isArray(spec)) return spec.map(normalizeSpec);
    return Object.keys(spec).sort().reduce((acc: any, key) => {
        acc[key] = normalizeSpec(spec[key]);
        return acc;
    }, {});
}

export class ScaffoldLineageRule implements ArchonRule {
  public readonly id = 'scaffold.lineage';
  public readonly description = 'Generate and inject .archon/lineage.json footprint';
  public readonly phase: RulePhase = 'scaffold';

  constructor(private readonly outDir: string, private readonly templateHash: string = "v2-orchestrator-templates") {}

  applies(ctx: ExecutionContext): boolean {
    return true; 
  }

  async apply(ctx: ExecutionContext): Promise<RuleResult> {
    const spec = ctx.spec as any;
    const normalizedSpec = normalizeSpec(spec);
    const specContent = JSON.stringify(normalizedSpec, null, 2);
    const specHash = crypto.createHash("sha256").update(specContent).digest("hex");

    const lineagePath = `.archon/lineage.json`;

    // Resolve Project ID: Input Spec > Previous State > Stable Name Hash
    let projectId = spec.projectId;
    if (!projectId && ctx.initialState?.spec?.projectId) {
      projectId = ctx.initialState.spec.projectId;
    }
    if (!projectId) {
      projectId = `proj_${crypto.createHash('md5').update(spec.name || 'unknown').digest('hex').substring(0, 8)}`;
    }

    // Resolve Revision ID: Input Spec > Trace ID
    const revisionId = spec.revisionId || ctx.trace.traceId;

    const manifest = {
      lineageVersion: "2.0",
      projectId,
      revisionId,
      lineageId: `lin_${crypto.randomBytes(4).toString("hex")}`,
      generatorVersion: "2.0.0",
      templateSetVersion: spec.platform?.swagger ? "nestjs-v1" : "nestjs-v1", // Consistent versioning
      specHash,
      templatesHash: this.templateHash,
      generatedAt: new Date().toISOString(),
      metadata: {
        specName: spec.name,
        targetDir: this.outDir,
        platform: spec.platform?.swagger ? "nestjs" : "basic",
      },
    };

    await ctx.vfs.write(lineagePath, JSON.stringify(manifest, null, 2));

    return {
      ruleId: this.id,
      status: 'applied',
      changes: [{
        type: 'create',
        path: lineagePath,
        summary: 'Generated Architecture Lineage manifest'
      }]
    };
  }
}
