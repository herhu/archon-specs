import { SpecCapsule, InjectionPack, ScaffoldOp, SemanticBinding } from './capsule';
import { templateEngine } from '../vfs/template-engine';
import { logger } from '../telemetry/logger';

export class CapsuleCompiler {
    async compile(capsule: SpecCapsule): Promise<InjectionPack> {
        logger.info({ capsuleId: capsule.capsuleId }, "Compiling architectural capsule");

        const scaffoldOps: ScaffoldOp[] = [];
        const bindings: SemanticBinding[] = [];

        // 1. Process Intent: Domains
        if (capsule.intent.domains) {
            for (const domain of capsule.intent.domains) {
                this.processDomain(domain, capsule, scaffoldOps, bindings);
            }
        }

        // 2. Add Explicit Bindings from capsule definition
        bindings.push(...capsule.bindings);

        return {
            capsuleId: capsule.capsuleId,
            exports: capsule.exports,
            imports: capsule.imports,
            scaffoldOps,
            bindings,
            metadata: {
                compiledAt: new Date().toISOString(),
                generatorVersion: "2.0.0-cla"
            }
        };
    }

    private processDomain(domain: any, capsule: SpecCapsule, scaffoldOps: ScaffoldOp[], bindings: SemanticBinding[]) {
        const domainKey = domain.key;
        const domainPascal = this.toPascalCase(domainKey);

        // Register the Module in AppModule
        bindings.push({
            type: "bind-symbol",
            targetSlot: "nestjs:AppModule.imports",
            value: {
                symbol: `${domainPascal}Module`,
                from: `./modules/${domainKey}/${domainKey}.module`
            }
        });

        // Scaffold Module File
        scaffoldOps.push({
            kind: "template",
            targetPath: `src/modules/${domainKey}/${domainKey}.module.ts`,
            sourcePath: "nestjs/module.ts.hbs",
            context: {
                domainName: domain.name,
                moduleClassName: `${domainPascal}Module`,
                entities: domain.entities?.map((e: any) => e.name) || [],
                services: domain.services?.map((s: any) => ({
                    className: `${this.toPascalCase(s.name)}Service`,
                    importPath: `./services/${this.toKebabCase(s.name)}.service`
                })) || [],
                controllers: domain.services?.map((s: any) => ({
                    className: `${this.toPascalCase(s.name)}Controller`,
                    importPath: `./controllers/${this.toKebabCase(s.name)}.controller`
                })) || []
            }
        });

        // Entities, Services, Controllers...
        if (domain.entities) {
            for (const entity of domain.entities) {
                scaffoldOps.push({
                    kind: "template",
                    targetPath: `src/modules/${domainKey}/entities/${this.toKebabCase(entity.name)}.entity.ts`,
                    sourcePath: "nestjs/entity.ts.hbs",
                    context: { entity }
                });
                
                scaffoldOps.push({
                    kind: "template",
                    targetPath: `src/modules/${domainKey}/dtos/create-${this.toKebabCase(entity.name)}.dto.ts`,
                    sourcePath: "nestjs/dto.ts.hbs",
                    context: { entity }
                });
            }
        }

        if (domain.services) {
            for (const service of domain.services) {
                scaffoldOps.push({
                    kind: "template",
                    targetPath: `src/modules/${domainKey}/services/${this.toKebabCase(service.name)}.service.ts`,
                    sourcePath: "nestjs/service.ts.hbs",
                    context: { service }
                });

                scaffoldOps.push({
                    kind: "template",
                    targetPath: `src/modules/${domainKey}/controllers/${this.toKebabCase(service.name)}.controller.ts`,
                    sourcePath: "nestjs/controller.ts.hbs",
                    context: { service }
                });
            }
        }
    }

    private toPascalCase(str: string): string {
        return str.replace(/(^\w|[-_]\w)/g, m => m.replace(/[-_]/, '').toUpperCase());
    }

    private toKebabCase(str: string): string {
        return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    }
}
