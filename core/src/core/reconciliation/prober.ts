import { Project, SyntaxKind, ClassDeclaration } from 'ts-morph';
import * as path from 'path';

export interface ProbedField {
    name: string;
    type: string;
    isPrimary?: boolean;
    isOptional?: boolean;
}

export interface ProbedEntity {
    name: string;
    fields: ProbedField[];
}

export interface ProbedDomain {
    name: string;
    entities: ProbedEntity[];
}

export interface ProbedSpec {
    domains: ProbedDomain[];
}

/**
 * EntityProber: Uses AST to reconstruct the architectural model from source code.
 */
export class EntityProber {
    private project: Project;

    constructor(private readonly outDir: string) {
        this.project = new Project();
    }

    async probe(): Promise<ProbedSpec> {
        const entitiesDir = path.join(this.outDir, 'src', 'modules');
        this.project.addSourceFilesAtPaths(path.join(entitiesDir, '**', 'entities', '*.entity.ts'));

        const domains: Map<string, ProbedDomain> = new Map();

        for (const sourceFile of this.project.getSourceFiles()) {
            const relativePath = path.relative(entitiesDir, sourceFile.getFilePath());
            const domainName = relativePath.split(path.sep)[0];

            if (!domains.has(domainName)) {
                domains.set(domainName, { name: domainName, entities: [] });
            }

            const classes = sourceFile.getClasses();
            for (const cls of classes) {
                if (this.isEntity(cls)) {
                    domains.get(domainName)!.entities.push(this.parseEntity(cls));
                }
            }
        }

        return { domains: Array.from(domains.values()) };
    }

    private isEntity(cls: ClassDeclaration): boolean {
        return cls.getDecorators().some(d => d.getName() === 'Entity');
    }

    private parseEntity(cls: ClassDeclaration): ProbedEntity {
        const entity: ProbedEntity = {
            name: cls.getName() || 'Unknown',
            fields: []
        };

        for (const prop of cls.getProperties()) {
            const decorators = prop.getDecorators().map(d => d.getName());
            
            // Skip non-database fields or internal relations for now
            if (!decorators.some(d => ['Column', 'PrimaryGeneratedColumn', 'PrimaryColumn', 'CreateDateColumn', 'UpdateDateColumn'].includes(d))) {
                continue;
            }

            entity.fields.push({
                name: prop.getName(),
                type: prop.getType().getText(),
                isPrimary: decorators.some(d => d.includes('Primary')),
                isOptional: prop.hasQuestionToken()
            });
        }

        return entity;
    }
}
