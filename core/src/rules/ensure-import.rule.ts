import { ArchonRule, RulePhase } from './archon-rule';
import { RuleResult } from './rule-result';
import { ExecutionContext } from '../core/engine/execution-context';

export interface EnsureImportOptions {
  id: string;
  path: string;
  moduleName: string;
  namedImports: string[];
}

export class EnsureImportRule implements ArchonRule {
  public readonly id: string;
  public readonly description: string;
  public readonly phase: RulePhase = 'merge';

  constructor(private options: EnsureImportOptions) {
    this.id = options.id;
    this.description = `Ensure import { ${options.namedImports.join(', ')} } from '${options.moduleName}' in ${options.path}`;
  }

  applies(ctx: ExecutionContext): boolean {
    return true; // We always evaluate it and let AstEditor handle idempotency
  }

  async apply(ctx: ExecutionContext): Promise<RuleResult> {
    try {
      const exists = await ctx.vfs.exists(this.options.path);
      if (!exists) {
        return {
          ruleId: this.id,
          status: 'failed',
          changes: [],
          error: `File ${this.options.path} does not exist.`
        };
      }

      const changed = await ctx.ast.ensureImport(this.options.path, this.options.moduleName, this.options.namedImports);

      if (!changed) {
        return {
          ruleId: this.id,
          status: 'no-op',
          changes: []
        };
      }

      return {
        ruleId: this.id,
        status: 'applied',
        changes: [{
          type: 'update',
          path: this.options.path,
          summary: `Added imports to ${this.options.path}`
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
