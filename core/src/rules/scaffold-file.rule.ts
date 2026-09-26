import { ArchonRule, RulePhase } from './archon-rule';
import { RuleResult } from './rule-result';
import { ExecutionContext } from '../core/engine/execution-context';
import * as path from 'path';
import * as fs from 'fs-extra';

export interface ScaffoldFileOptions {
  id: string;
  templateName: string;
  outputPath: string;
  data?: any;
  /**
   * When true, the file is fully regenerated on every run (no skip-if-exists).
   * Use only for 100%-generated, manual-region-free artifacts such as schema.sql,
   * so that evolving the spec (new entities/fields) keeps the artifact in sync.
   */
  overwrite?: boolean;
}

export class ScaffoldFileRule implements ArchonRule {
  public readonly id: string;
  public readonly description: string;
  public readonly phase: RulePhase = 'scaffold';

  constructor(private options: ScaffoldFileOptions) {
    this.id = options.id;
    this.description = `Scaffold file from ${options.templateName} to ${options.outputPath}`;
  }

  applies(ctx: ExecutionContext): boolean {
    return true; // Always evaluate, idempotency is checked in apply()
  }

  async apply(ctx: ExecutionContext): Promise<RuleResult> {
    await ctx.vfs.touch(this.options.outputPath);
    const exists = await ctx.vfs.exists(this.options.outputPath);
    if (exists && !ctx.force && !this.options.overwrite) {
      return {
        ruleId: this.id,
        status: 'no-op',
        changes: [],
        warnings: [`File ${this.options.outputPath} already exists, skipping scaffold (use force-align to overwrite).`]
      };
    }

    try {
      let templateContent: string | undefined;
      const tplPath = path.join(__dirname, '..', 'templates', this.options.templateName);
      if (await fs.pathExists(tplPath)) {
          templateContent = await fs.readFile(tplPath, 'utf-8');
      }
      
      let finalContent = "";
      // Code files (.ts) render strictly (missing var = error); leaf/text files
      // (env, scripts, docs, sql) stay lenient — they carry intentional placeholders.
      const strict = this.options.outputPath.endsWith(".ts");
      if (templateContent) {
          finalContent = ctx.template.render(templateContent, { ...ctx.spec, ...this.options.data }, { strict });
      } else {
          // If we can't find it, we just render an empty string or it's up to an actual template lookup logic
          finalContent = ctx.template.render(`// Scaffold missing template for ${this.options.templateName}`, { ...ctx.spec, ...this.options.data });
      }

      await ctx.vfs.write(this.options.outputPath, finalContent);

      return {
        ruleId: this.id,
        status: 'applied',
        changes: [{
          type: 'create',
          path: this.options.outputPath,
          summary: `Scaffolded ${this.options.outputPath}`
        }]
      };
    } catch (err: any) {
      return {
        ruleId: this.id,
        status: 'failed',
        changes: [],
        error: err.message
      };
    }
  }
}
