import { ArchonRule, RulePhase } from './archon-rule';
import { RuleResult } from './rule-result';
import { ExecutionContext } from '../core/engine/execution-context';

export interface EnsureNestModuleRegistrationOptions {
  id: string;
  path: string;
  arrayName: string; // e.g. 'imports', 'providers', 'controllers'
  symbolName: string;
}

export class EnsureNestModuleRegistrationRule implements ArchonRule {
  public readonly id: string;
  public readonly description: string;
  public readonly phase: RulePhase = 'merge';

  constructor(private options: EnsureNestModuleRegistrationOptions) {
    this.id = options.id;
    this.description = `Ensure ${options.symbolName} is registered in @Module ${options.arrayName} array in ${options.path}`;
  }

  applies(ctx: ExecutionContext): boolean {
    return true; // Idempotency handled by AstEditor
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

      const changed = await ctx.ast.ensureArrayItem(this.options.path, {
        decoratorName: 'Module',
        propertyName: this.options.arrayName
      }, this.options.symbolName);

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
          summary: `Registered ${this.options.symbolName} in ${this.options.path}`
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
