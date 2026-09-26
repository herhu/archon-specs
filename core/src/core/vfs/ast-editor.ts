import { Project, SourceFile, SyntaxKind } from 'ts-morph';
import { VirtualTree } from './vfs';

export interface ArrayLocator {
  decoratorName: string;
  propertyName: string;
}

export class AstEditor {
  private project: Project;

  constructor(private readonly vfs: VirtualTree) {
    this.project = new Project({ useInMemoryFileSystem: true });
  }

  /**
   * Extracts the `provide:` token from an object-literal provider text, e.g.
   * `{ provide: PRODUCT_REPOSITORY, useClass: TypeOrmProductRepository }` → `PRODUCT_REPOSITORY`.
   * Returns null for plain symbols (`RedisModule`) so they fall back to text-equality.
   */
  static extractProvideToken(text: string): string | null {
    const m = text.match(/provide\s*:\s*([^,}\n]+)/);
    return m ? m[1].trim() : null;
  }

  private async getSourceFile(filePath: string): Promise<SourceFile | undefined> {
    const content = await this.vfs.read(filePath);
    if (content === undefined) return undefined;
    return this.project.createSourceFile(filePath, content, { overwrite: true });
  }

  private async saveSourceFile(filePath: string, sourceFile: SourceFile): Promise<void> {
    const newContent = sourceFile.getFullText();
    await this.vfs.write(filePath, newContent);
  }

  async ensureImport(filePath: string, moduleName: string, namedImports: string[]): Promise<{ changed: boolean, reason?: string }> {
    const sourceFile = await this.getSourceFile(filePath);
    if (!sourceFile) return { changed: false, reason: "file-not-found" };

    let changed = false;
    const existingImport = sourceFile.getImportDeclaration(decl => decl.getModuleSpecifierValue() === moduleName);

    if (existingImport) {
      for (const namedImport of namedImports) {
        if (!existingImport.getNamedImports().some(ni => ni.getName() === namedImport)) {
          existingImport.addNamedImport(namedImport);
          changed = true;
        }
      }
    } else {
      sourceFile.addImportDeclaration({
        moduleSpecifier: moduleName,
        namedImports: namedImports
      });
      changed = true;
    }

    if (changed) {
      await this.saveSourceFile(filePath, sourceFile);
      return { changed: true };
    }
    return { changed: false, reason: "import-already-exists" };
  }

  async ensureNestModuleImport(filePath: string, symbolName: string, fromModule: string): Promise<{ changed: boolean, reason?: string }> {
    const importRes = await this.ensureImport(filePath, fromModule, [symbolName]);
    let changed = importRes.changed;
    
    const sourceFile = await this.getSourceFile(filePath);
    if (!sourceFile) return { changed: false, reason: "file-not-found" };

    const classes = sourceFile.getClasses();
    for (const cls of classes) {
      const moduleDecorator = cls.getDecorator('Module');
      if (moduleDecorator) {
        const objLiteral = moduleDecorator.getArguments()[0];
        if (objLiteral && objLiteral.getKind() === SyntaxKind.ObjectLiteralExpression) {
          const importsProp = objLiteral.asKind(SyntaxKind.ObjectLiteralExpression)?.getProperty('imports');
          
          if (importsProp && importsProp.getKind() === SyntaxKind.PropertyAssignment) {
            const arrLiteral = importsProp.asKind(SyntaxKind.PropertyAssignment)?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
            if (arrLiteral) {
              const elements = arrLiteral.getElements();
              if (!elements.some(elem => elem.getText() === symbolName)) {
                arrLiteral.addElement(symbolName);
                changed = true;
              }
            }
          } else if (!importsProp) {
             const obj = objLiteral.asKind(SyntaxKind.ObjectLiteralExpression);
             obj?.addPropertyAssignment({
                 name: 'imports',
                 initializer: `[${symbolName}]`
             });
             changed = true;
          }
        }
      }
    }

    if (changed) {
      await this.saveSourceFile(filePath, sourceFile);
      return { changed: true };
    }
    return { changed: false, reason: "module-already-registered" };
  }

  async ensureArrayItem(filePath: string, locator: ArrayLocator, value: string): Promise<{ changed: boolean, reason?: string }> {
    const sourceFile = await this.getSourceFile(filePath);
    if (!sourceFile) return { changed: false, reason: "file-not-found" };

    let changed = false;

    for (const cls of sourceFile.getClasses()) {
      const decorator = cls.getDecorator(locator.decoratorName);
      if (decorator) {
        const objLiteral = decorator.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression);
        if (objLiteral) {
          const prop = objLiteral.getProperty(locator.propertyName)?.asKind(SyntaxKind.PropertyAssignment);
          if (prop) {
            const arrLiteral = prop.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
            if (arrLiteral) {
              // Idempotency: plain symbols match by text; object-literal providers
              // ({ provide: TOKEN, useClass: ... }) match by their `provide:` token,
              // because ts-morph re-prints whitespace and text-equality would
              // duplicate the same provider on every regeneration (E5 regression).
              const newToken = AstEditor.extractProvideToken(value);
              const exists = arrLiteral.getElements().some(elem => {
                const elemText = elem.getText();
                if (elemText === value) return true;
                if (newToken) {
                  const elemToken = AstEditor.extractProvideToken(elemText);
                  return elemToken !== null && elemToken === newToken;
                }
                return false;
              });
              if (!exists) {
                arrLiteral.addElement(value);
                changed = true;
              }
            }
          } else {
             objLiteral.addPropertyAssignment({
                 name: locator.propertyName,
                 initializer: `[${value}]`
             });
             changed = true;
          }
        }
      }
    }

    if (changed) {
      await this.saveSourceFile(filePath, sourceFile);
      return { changed: true };
    }
    return { changed: false, reason: "item-already-exists" };
  }

  async mergeTypeScriptContent(filePath: string, newContent: string): Promise<boolean> {
    const targetFile = await this.getSourceFile(filePath);
    if (!targetFile) return false;

    // Use a unique name for temporary AST parsing
    const tempFileName = `temp_${Date.now()}.ts`;
    const sourceFile = this.project.createSourceFile(tempFileName, newContent, { overwrite: true });
    let changed = false;

    // 1. Merge Imports
    for (const imp of sourceFile.getImportDeclarations()) {
        const modSpecifier = imp.getModuleSpecifierValue();
        const existingImp = targetFile.getImportDeclaration(decl => decl.getModuleSpecifierValue() === modSpecifier);

        if (existingImp) {
            for (const named of imp.getNamedImports()) {
                if (!existingImp.getNamedImports().some(ni => ni.getName() === named.getName())) {
                    existingImp.addNamedImport(named.getStructure() as any);
                    changed = true;
                }
            }
            if (imp.getDefaultImport() && !existingImp.getDefaultImport()) {
                existingImp.setDefaultImport(imp.getDefaultImport()!.getText());
                changed = true;
            }
        } else {
            targetFile.addImportDeclaration(imp.getStructure() as any);
            changed = true;
        }
    }

    // 2. Merge Classes
    for (const srcClass of sourceFile.getClasses()) {
        const className = srcClass.getName();
        if (!className) continue;

        const targetClass = targetFile.getClass(className);
        if (!targetClass) {
            targetFile.addClass(srcClass.getStructure() as any);
            changed = true;
        } else {
            // Check Class-Level Ownership
            if (targetClass.getDecorator('ArchonManual')) continue;

            // Decorator Sync: Only merge new class decorators, don't delete existing ones.
            for (const dec of srcClass.getDecorators()) {
                if (!targetClass.getDecorator(dec.getName())) {
                    targetClass.addDecorator(dec.getStructure() as any);
                    changed = true;
                }
            }

            // Property Merge: Add new fields (e.g. from entity spec additions)
            for (const srcProp of srcClass.getProperties()) {
                const propName = srcProp.getName();
                const existingProp = targetClass.getProperty(propName);
                if (!existingProp) {
                    targetClass.addProperty(srcProp.getStructure() as any);
                    changed = true;
                }
            }

            // Constructor Merge: additively reconcile DI parameters. E3/E5 inject a
            // use-case / repository port into an EXISTING controller or service
            // constructor; the property-merge above never touches constructor params,
            // so without this the new dependency silently fails to wire on regen.
            // Non-destructive: existing params are never removed or retyped (protects
            // hand-edited injection); only params missing-by-name are appended.
            const srcCtor = srcClass.getConstructors()[0];
            if (srcCtor) {
                const targetCtor = targetClass.getConstructors()[0];
                if (!targetCtor) {
                    targetClass.addConstructor(srcCtor.getStructure() as any);
                    changed = true;
                } else {
                    const existingParamNames = new Set(targetCtor.getParameters().map(p => p.getName()));
                    for (const p of srcCtor.getParameters()) {
                        if (!existingParamNames.has(p.getName())) {
                            targetCtor.addParameter(p.getStructure() as any);
                            changed = true;
                        }
                    }
                }
            }

            // Method Merge: Overwrite boilerplate methods unless protected
            for (const srcMethod of srcClass.getMethods()) {
                const methodName = srcMethod.getName();
                const existingMethod = targetClass.getMethod(methodName);

                if (!existingMethod) {
                    targetClass.addMethod(srcMethod.getStructure() as any);
                    changed = true;
                } else {
                    if (existingMethod.getDecorator('ArchonManual')) {
                        continue; // Protect human written logic!
                    } else {
                        existingMethod.remove();
                        targetClass.addMethod(srcMethod.getStructure() as any);
                        changed = true;
                    }
                }
            }
        }
    }

    if (changed) {
        await this.saveSourceFile(filePath, targetFile);
    }
    
    // Cleanup temporary file from memory
    sourceFile.forget();
    return changed;
  }
}
