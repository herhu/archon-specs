import { ArchonRule, RulePhase } from './archon-rule';
import { RuleResult } from './rule-result';
import { ExecutionContext } from '../core/engine/execution-context';
import * as path from 'path';
import * as fs from 'fs-extra';

export interface AstMergeFileOptions {
  id: string;
  templateName: string;
  outputPath: string;
  data?: any;
  /** Topological layer within the scaffold phase (entities=0 … app.module=5). */
  layer?: number;
}

export class AstMergeRule implements ArchonRule {
  public readonly id: string;
  public readonly description: string;
  public readonly phase: RulePhase = 'scaffold';
  public readonly layer: number;

  constructor(private options: AstMergeFileOptions) {
    this.id = options.id;
    this.layer = options.layer ?? 0;
    this.description = `Generate and merge AST elements from ${options.templateName} into ${options.outputPath}`;
  }

  applies(ctx: ExecutionContext): boolean {
    return true; 
  }

  async apply(ctx: ExecutionContext): Promise<RuleResult> {
    await ctx.vfs.touch(this.options.outputPath);
    const exists = await ctx.vfs.exists(this.options.outputPath);
    
    let templateContent: string | undefined;
    const tplPath = path.join(__dirname, '..', 'templates', this.options.templateName);
    if (await fs.pathExists(tplPath)) {
        templateContent = await fs.readFile(tplPath, 'utf-8');
    }
    
    let finalContent = "";
    if (templateContent) {
        // AstMergeRule always produces TypeScript — render strictly so a missing
        // variable throws instead of silently emitting broken code.
        finalContent = ctx.template.render(templateContent, { ...ctx.spec, ...this.options.data }, { strict: true });
    } else {
        finalContent = ctx.template.render(`// Scaffold missing template for ${this.options.templateName}`, { ...ctx.spec, ...this.options.data });
    }

    if (!exists) {
        await ctx.vfs.write(this.options.outputPath, finalContent);
        return {
          ruleId: this.id,
          status: 'applied',
          changes: [{
            type: 'create',
            path: this.options.outputPath,
            summary: `Created ${this.options.outputPath}`
          }]
        };
    } else {
        const changed = await ctx.ast.mergeTypeScriptContent(this.options.outputPath, finalContent);
        if (changed) {
             return {
                ruleId: this.id,
                status: 'applied',
                changes: [{
                    type: 'update',
                    path: this.options.outputPath,
                    summary: `Statically merged new elements into ${this.options.outputPath}`
                }]
             };
        } else {
             return {
                ruleId: this.id,
                status: 'no-op',
                changes: [],
                warnings: [`${this.options.outputPath} is structurally identical to spec state.`]
             };
        }
    }
  }
}
