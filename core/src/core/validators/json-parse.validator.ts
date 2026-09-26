import { VirtualTree } from '../vfs/vfs';
import { Validator, ValidationResult } from './validator';

export class JsonParseValidator implements Validator {
  id = 'json-parse';

  async validate(vfs: VirtualTree): Promise<ValidationResult> {
    const changes = vfs.listChanges();
    const errors: string[] = [];

    for (const change of changes) {
      if (change.type === 'delete') continue;
      if (!change.path.endsWith('.json')) continue;

      const content = await vfs.read(change.path);
      if (content) {
        try {
          JSON.parse(content);
        } catch (err: any) {
          const e = `[${change.path}] Invalid JSON: ${err.message}`;
          errors.push(e);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
