import { ArchonRule, RulePhase } from './archon-rule';
import { RuleResult } from './rule-result';
import { ExecutionContext } from '../core/engine/execution-context';

// Fast minimal pointer set Implementation. E.g. pointer="/dependencies/mongoose"
function setJsonPointer(obj: any, pointer: string, value: any): boolean {
  if (!pointer.startsWith('/')) throw new Error('Pointer must start with /');
  const parts = pointer.split('/').slice(1);
  let current = obj;
  let changed = false;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part]) {
      current[part] = {};
      changed = true;
    }
    current = current[part];
  }

  const lastPart = parts[parts.length - 1];
  if (current[lastPart] !== value) {
    current[lastPart] = value;
    changed = true;
  }

  return changed;
}

export interface EnsureJsonValueOptions {
  id: string;
  path: string; // e.g. package.json
  pointer: string; // e.g. /dependencies/mongoose
  value: any;
}

export class EnsureJsonValueRule implements ArchonRule {
  public readonly id: string;
  public readonly description: string;
  public readonly phase: RulePhase = 'merge';

  constructor(private options: EnsureJsonValueOptions) {
    this.id = options.id;
    this.description = `Ensure ${options.pointer} in ${options.path} is set`;
  }

  applies(ctx: ExecutionContext): boolean {
    return true; // We always evaluate it and idempotency is handled
  }

  async apply(ctx: ExecutionContext): Promise<RuleResult> {
    try {
      const contentStr = await ctx.vfs.read(this.options.path);
      let obj = {};
      let isNew = true;

      if (contentStr) {
        obj = JSON.parse(contentStr);
        isNew = false;
      }

      const changed = setJsonPointer(obj, this.options.pointer, this.options.value);

      if (!changed && !isNew) {
        return {
          ruleId: this.id,
          status: 'no-op',
          changes: []
        };
      }

      await ctx.vfs.write(this.options.path, JSON.stringify(obj, null, 2));

      return {
        ruleId: this.id,
        status: 'applied',
        changes: [{
          type: isNew ? 'create' : 'update',
          path: this.options.path,
          summary: `Set ${this.options.pointer} in ${this.options.path}`
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
