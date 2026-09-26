import { VirtualTree } from '../vfs/vfs';
import { Validator, ValidationResult } from './validator';
import { Project } from 'ts-morph';

export class TypescriptParseValidator implements Validator {
  id = 'typescript-parse';

  async validate(vfs: VirtualTree): Promise<ValidationResult> {
    const changes = vfs.listChanges();
    const errors: string[] = [];

    // Scoped/incremental validation: only files touched THIS run are checked.
    // Fast-path — if no .ts file changed, skip ts-morph Project construction
    // entirely (a no-op regeneration shouldn't pay any validation cost).
    // Test files (*.spec.ts / *.test.ts) are intentionally NOT parse-validated here:
    // they target the jest/ts-jest toolchain (jest globals like `describe`/`it`, the
    // `jest` namespace), and the generated project's own tsconfig excludes them from
    // `tsc`. ts-jest type-checks + runs them at `npm test` instead. Validating them
    // with this app-code parser produces false "Cannot find name 'describe'" errors.
    const tsChanges = changes.filter(
      (c) => c.type !== "delete" && c.path.endsWith(".ts") && !/\.(spec|test)\.ts$/.test(c.path),
    );
    if (tsChanges.length === 0) {
      return { valid: true, errors: [] };
    }

    const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
            noResolve: true,
            skipLibCheck: true,
            experimentalDecorators: true,
            emitDecoratorMetadata: true
        }
    });

    for (const change of tsChanges) {
      const content = await vfs.read(change.path);
      if (content) {
        try {
          const sourceFile = project.createSourceFile(change.path, content, { overwrite: true });
          const diagnostics = sourceFile.getPreEmitDiagnostics();
          
          for (const diag of diagnostics) {
            const message = diag.getMessageText();
            const text = typeof message === 'string' ? message : message.getMessageText();
            // We just do light syntax validation, ignore common environmental semantic errors
            if (diag.getCategory() === 1) { // Error
                const code = diag.getCode();
                // Ignore common environmental semantic errors:
                // 2307: missing module, 2304: missing name, 2580: process, 2591: require
                // 7006: implicit any, 1206: decorators, 18046: unknown, 7044: implicit any/unknown
                // 2882: side-effect import of an unresolved module (e.g. 'reflect-metadata')
                if ([2307, 2304, 2580, 2591, 7006, 1206, 18046, 7044, 2882].includes(code)) continue;

                const err = `[${change.path}] TS Error (${code}): ${text}`;
                errors.push(err);
            }
          }
        } catch (err: any) {
          errors.push(`[${change.path}] Parse error: ${err.message}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
