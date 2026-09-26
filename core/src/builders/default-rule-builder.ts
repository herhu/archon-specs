import { createHash } from 'crypto';
import { ArchonRule } from '../rules/archon-rule';
import { ScaffoldFileRule } from '../rules/scaffold-file.rule';
import { EnsureJsonValueRule } from '../rules/ensure-json-value.rule';
import { EnsureImportRule } from '../rules/ensure-import.rule';
import { EnsureNestModuleRegistrationRule } from '../rules/ensure-nest-module-registration.rule';
import { ScaffoldLineageRule } from '../rules/scaffold-lineage.rule';
import { AstMergeRule } from '../rules/ast-merge.rule';
import { ArchonSpec } from '../core/engine/execution-context';
import { toKebabCase, toPascalCase, toCamelCase } from '../core/vfs/template-engine';

export class DefaultRuleBuilder {
  /** Resolve the primary-key name/type for an entity (defaults to id/string). */
  private getIdInfo(entity: any): { idName: string; idType: string } {
    const pkField = (entity.fields || []).find((f: any) => f.primary);
    const idName = entity.primaryKey || pkField?.name || 'id';
    const idType = pkField?.type === 'int' ? 'number' : 'string';
    return { idName, idType };
  }

  /**
   * E5 — repository port/adapter metadata for an entity. The domain layer depends on
   * the port interface + DI token; the TypeORM adapter is the swappable infra detail.
   */
  private getRepoInfo(entity: any): {
    token: string; portInterface: string; adapterClass: string; kebab: string;
  } {
    const name = entity.name || 'Unknown';
    const pascal = toPascalCase(name);
    const token = `${name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()}_REPOSITORY`;
    return {
      token,
      portInterface: `${pascal}Repository`,
      adapterClass: `TypeOrm${pascal}Repository`,
      kebab: toKebabCase(name),
    };
  }

  /** Enrich custom operations with controller params, service call args and scopes. */
  private enrichControllerOperations(operations: any[], domainKey: string, entity: any): any[] {
    return (operations || [])
      .filter((op) => !['create', 'findAll', 'findOne', 'update', 'delete'].includes(op.name))
      .map((op) => {
      const pathParams = (op.path || '').split('/').filter((p: string) => p.startsWith(':')).map((p: string) => p.substring(1));
      const controllerParams: string[] = [];
      const serviceArgs: string[] = [];

      pathParams.forEach((p: string) => {
        controllerParams.push(`@Param('${p}') ${p}: string`);
        serviceArgs.push(p);
      });

      const isWrite = op.method !== 'GET' && op.method !== 'DELETE';
      if (isWrite) {
        // Most custom writes are creates; only treat explicit update/patch verbs as partial.
        const dtoType = /update|patch|edit/i.test(op.name) ? `Update${entity.name}Dto` : `Create${entity.name}Dto`;
        controllerParams.push(`@Body() dto: ${dtoType}`);
        serviceArgs.push('...dto');
      }

      return {
        ...op,
        authRequired: op.authz?.required !== false,
        effectiveScopes: op.authz?.scopesAll?.length ? op.authz.scopesAll : [`${domainKey}:${op.method === 'GET' ? 'read' : 'write'}`],
        controllerParams: controllerParams.join(', '),
        serviceCallParams: serviceArgs.length > 0 ? `{ ${serviceArgs.join(', ')} }` : '{}',
        // E3 — each custom operation is an application use-case the controller calls.
        useCaseClass: `${toPascalCase(op.name)}UseCase`,
        useCaseProp: `${toCamelCase(op.name)}UseCase`,
      };
    });
  }

  /** Build the entity template context: derived relations (from FK references), FK-column de-dup, timestamp guards, cross-domain imports. */
  private buildEntityData(entity: any, domain: any, spec: any): any {
    const getImportPath = (targetName: string) => {
      const targetDomain = (spec.domains || []).find((d: any) => (d.entities || []).some((e: any) => e.name === targetName));
      if (!targetDomain || targetDomain.key === domain.key) return `./${toKebabCase(targetName)}.entity`;
      return `../../${toKebabCase(targetDomain.key)}/entities/${toKebabCase(targetName)}.entity`;
    };

    const effectiveRelationships = [...(entity.relationships || [])];
    (entity.fields || []).forEach((field: any) => {
      if (field.references) {
        const exists = effectiveRelationships.some((r: any) => r.joinColumn === field.name || r.name === toCamelCase(field.references.entity));
        if (!exists) {
          effectiveRelationships.push({
            name: toCamelCase(field.references.entity),
            type: 'manyToOne',
            targetEntity: field.references.entity,
            joinColumn: field.name,
          });
        }
      }
    });

    const joinColumns = new Set(effectiveRelationships.map((r: any) => r.joinColumn).filter(Boolean));
    const annotatedFields = (entity.fields || []).map((f: any) => ({ ...f, isFkColumn: joinColumns.has(f.name) }));
    const relatedEntities = effectiveRelationships.map((r: any) => ({ name: r.targetEntity, importPath: getImportPath(r.targetEntity) }));

    return {
      entity: { ...entity, fields: annotatedFields, relationships: effectiveRelationships },
      relatedEntities,
      hasCreatedAt: (entity.fields || []).some((f: any) => f.name === 'createdAt'),
      hasUpdatedAt: (entity.fields || []).some((f: any) => f.name === 'updatedAt'),
    };
  }

  build(spec: ArchonSpec, outDir: string): ArchonRule[] {
    const rules: ArchonRule[] = [];
    const hasRedis = spec.modules?.some(m => m.type === 'cache.redis' || m.name === 'cache.redis') || false;
    const hasQueue = spec.modules?.some(m => m.type === 'queue.bullmq' || m.name === 'queue.bullmq') || false;
    const hasTransactions = spec.modules?.some(m => m.type === 'db-transactions' || m.name === 'db-transactions') || false;
    // E4 — the transactional outbox needs BOTH a queue (to relay events) and
    // db-transactions (to write events in the same tx as the business change).
    const enableOutbox = hasQueue && hasTransactions;
    // Platform-driven cross-cutting flags wired into main.ts / app.module.
    const pf: any = spec.platform || {};
    const enableCors = pf.cors !== false; // on by default
    const enableThrottle = !!pf.throttling;
    const throttleTtlMs = (pf.rateLimitTtl ?? 60) * 1000;
    const throttleLimit = pf.rateLimitMax ?? 100;
    const templateData = { ...spec, projectName: spec.name, hasRedis, hasQueue, hasTransactions, enableOutbox, enableCors, enableThrottle, throttleTtlMs, throttleLimit };

    rules.push(new ScaffoldLineageRule(outDir));

    // Basic app boilerplate
    rules.push(new ScaffoldFileRule({
      id: 'scaffold.package.json',
      templateName: 'nestjs/package.json.hbs',
      outputPath: `${outDir}/package.json`,
      data: templateData
    }));
    rules.push(new ScaffoldFileRule({
      id: 'scaffold.tsconfig.json',
      templateName: 'nestjs/tsconfig.json.hbs',
      outputPath: `${outDir}/tsconfig.json`,
      data: templateData
    }));
    // tsconfig.build.json keeps *.spec.ts out of dist; tsconfig.json now INCLUDES
    // specs so eslint typed-linting + `tsc --noEmit` resolve @types/jest globals.
    rules.push(new ScaffoldFileRule({
      id: 'scaffold.tsconfig.build.json',
      templateName: 'nestjs/tsconfig.build.json.hbs',
      outputPath: `${outDir}/tsconfig.build.json`,
      data: templateData
    }));
    // jest setup (metadata polyfill + deterministic test env for DI/guards).
    rules.push(new ScaffoldFileRule({
      id: 'scaffold.test.setup',
      templateName: 'nestjs/test-setup.ts.hbs',
      outputPath: `${outDir}/src/test-setup.ts`,
      data: templateData
    }));
    rules.push(new AstMergeRule({
      id: 'scaffold.app.module',
      templateName: 'nestjs/app.module.ts.hbs',
      outputPath: `${outDir}/src/app.module.ts`,
      data: templateData
    }));
    rules.push(new AstMergeRule({
      id: 'scaffold.main.ts',
      templateName: 'nestjs/main.ts.hbs',
      outputPath: `${outDir}/src/main.ts`,
      data: templateData
    }));

    
    const platform = { husky: true, ...(spec.platform || {}) };

    // Boilerplate files
    const boilerplate = [
        { id: 'scaffold.env.example', tpl: 'nestjs/env.example.hbs', out: '.env.example' },
        { id: 'scaffold.env.docker', tpl: 'nestjs/env.docker.hbs', out: '.env.docker' },
        { id: 'scaffold.gitignore', tpl: 'nestjs/gitignore.hbs', out: '.gitignore' },
        { id: 'scaffold.eslintrc', tpl: 'nestjs/eslintrc.json.hbs', out: '.eslintrc.json' },
        { id: 'scaffold.prettierrc', tpl: 'nestjs/prettierrc.hbs', out: '.prettierrc' },
        { id: 'scaffold.vscode.launch', tpl: 'nestjs/vscode/launch.json.hbs', out: '.vscode/launch.json' },
        { id: 'scaffold.dockerfile', tpl: 'nestjs/Dockerfile.hbs', out: 'Dockerfile' },
        { id: 'scaffold.dockerignore', tpl: 'nestjs/dockerignore.hbs', out: '.dockerignore' },
        { id: 'scaffold.dockercompose', tpl: 'nestjs/docker-compose.yml.hbs', out: 'docker-compose.yml' },
        { id: 'scaffold.readme', tpl: 'nestjs/README.md.hbs', out: 'README.md' }
    ];

    for (const file of boilerplate) {
        rules.push(new ScaffoldFileRule({
            id: file.id,
            templateName: file.tpl,
            outputPath: `${outDir}/${file.out}`,
            data: { ...spec, projectName: spec.name }
        }));
    }

    if (platform.husky !== false) {
        rules.push(new ScaffoldFileRule({ id: 'scaffold.husky.pre', templateName: 'nestjs/husky/pre-commit.hbs', outputPath: `${outDir}/.husky/pre-commit`, data: spec }));
        rules.push(new ScaffoldFileRule({ id: 'scaffold.husky.msg', templateName: 'nestjs/husky/prepare-commit-msg.hbs', outputPath: `${outDir}/.husky/prepare-commit-msg`, data: spec }));
    }
    if (platform.jenkins) {
        rules.push(new ScaffoldFileRule({ id: 'scaffold.jenkins', templateName: 'nestjs/Jenkinsfile.hbs', outputPath: `${outDir}/Jenkinsfile`, data: { ...spec, projectName: spec.name, platformConfig: platform } }));
    }
    if (platform.frogbot) {
        rules.push(new ScaffoldFileRule({ id: 'scaffold.frogbot', templateName: 'nestjs/github/frogbot.yml.hbs', outputPath: `${outDir}/.github/workflows/frogbot.yml`, data: spec }));
    }
    if (platform.sonarQube) {
        rules.push(new ScaffoldFileRule({ id: 'scaffold.sonar', templateName: 'nestjs/sonar-project.properties.hbs', outputPath: `${outDir}/sonar-project.properties`, data: { projectName: spec.name } }));
    }
    if (platform.newRelic) {
        rules.push(new ScaffoldFileRule({ id: 'scaffold.newrelic', templateName: 'nestjs/newrelic.js.hbs', outputPath: `${outDir}/newrelic.js`, data: { projectName: spec.name } }));
    }
    if (platform.terraform) {
        rules.push(new ScaffoldFileRule({ id: 'scaffold.terraform', templateName: 'nestjs/infrastructure/main.tf.hbs', outputPath: `${outDir}/infrastructure/main.tf`, data: { projectName: spec.name } }));
    }
    if (platform.nginxProxy) {
        rules.push(new ScaffoldFileRule({ id: 'scaffold.nginx', templateName: 'nestjs/docker_assets/default.conf.hbs', outputPath: `${outDir}/docker_assets/default.conf`, data: spec }));
        rules.push(new ScaffoldFileRule({ id: 'scaffold.openapi.cert', templateName: 'nestjs/specs/openapi.yaml.hbs', outputPath: `${outDir}/specs/cert/openapi.yaml`, data: { projectName: spec.name, env: "cert" } }));
        rules.push(new ScaffoldFileRule({ id: 'scaffold.openapi.prod', templateName: 'nestjs/specs/openapi.yaml.hbs', outputPath: `${outDir}/specs/prod/openapi.yaml`, data: { projectName: spec.name, env: "prod" } }));
    }

    
    // Docs
    rules.push(new ScaffoldFileRule({ id: 'scaffold.docs.api', templateName: 'docs/api.md.hbs', outputPath: `${outDir}/docs/api.md`, data: spec }));
    rules.push(new ScaffoldFileRule({ id: 'scaffold.docs.gov', templateName: 'docs/governance.md.hbs', outputPath: `${outDir}/docs/governance.md`, data: { projectName: spec.name } }));
    
    // architecture.md is ALWAYS generated (a v3 DDD project should document its layers,
    // domain map, and @ArchonManual seams). UML diagrams are embedded when the governed
    // pipeline provided them; the pro/manual path still gets the full structural doc.
    const assets = (spec.meta?.architecturalAssets) || (spec.architecturalAssets) || [];
    const archFingerprint = createHash('sha1').update(JSON.stringify(spec.domains || [])).digest('hex').slice(0, 12);
    rules.push(new ScaffoldFileRule({
        id: 'scaffold.docs.architecture',
        templateName: 'docs/architecture.md.hbs',
        outputPath: `${outDir}/docs/architecture.md`,
        data: {
            projectName: spec.name,
            domains: spec.domains || [],
            crossCutting: spec.crossCutting,
            enableOutbox,
            specFingerprint: archFingerprint,
            modelCode: assets[0] || "",
            sequenceCode: assets[1] || "",
        },
        overwrite: true,
    }));

    // Scripts
    rules.push(new ScaffoldFileRule({ id: 'scaffold.scripts.token', templateName: 'scripts/get-token.sh.hbs', outputPath: `${outDir}/scripts/get-token.sh`, data: spec }));
    rules.push(new ScaffoldFileRule({ id: 'scaffold.scripts.curl', templateName: 'scripts/curl.sh.hbs', outputPath: `${outDir}/scripts/curl.sh`, data: spec }));
    rules.push(new ScaffoldFileRule({ id: 'scaffold.scripts.dockerup', templateName: 'scripts/docker-up.sh.hbs', outputPath: `${outDir}/scripts/docker-up.sh`, data: spec }));
    rules.push(new ScaffoldFileRule({ id: 'scaffold.scripts.dockerdown', templateName: 'scripts/docker-down.sh.hbs', outputPath: `${outDir}/scripts/docker-down.sh`, data: spec }));
    rules.push(new ScaffoldFileRule({ id: 'scaffold.scripts.archon', templateName: 'scripts/ARCHON.sh.hbs', outputPath: `${outDir}/ARCHON.sh`, data: templateData }));
    if (platform.husky !== false) {
        rules.push(new ScaffoldFileRule({ id: 'scaffold.scripts.branch', templateName: 'scripts/branch-to-commit-message.sh.hbs', outputPath: `${outDir}/scripts/branch-to-commit-message.sh`, data: spec }));
    }
    rules.push(new ScaffoldFileRule({ id: 'scaffold.scripts.migrate', templateName: 'scripts/db-migrate.ts.hbs', outputPath: `${outDir}/scripts/db-migrate.ts`, data: spec }));

    
    // Auth Configurations
    if (spec.crossCutting?.auth) {
        rules.push(new ScaffoldFileRule({ id: 'scaffold.auth.module', templateName: 'nestjs/auth/auth.module.ts.hbs', outputPath: `${outDir}/src/auth/auth.module.ts`, data: spec }));
        rules.push(new ScaffoldFileRule({ id: 'scaffold.auth.jwt', templateName: 'nestjs/auth/jwt.config.ts.hbs', outputPath: `${outDir}/src/auth/jwt.config.ts`, data: spec }));
        rules.push(new ScaffoldFileRule({ id: 'scaffold.auth.guard', templateName: 'nestjs/auth/jwt.guard.ts.hbs', outputPath: `${outDir}/src/auth/jwt.guard.ts`, data: spec }));
        rules.push(new ScaffoldFileRule({ id: 'scaffold.auth.scopes_dec', templateName: 'nestjs/auth/scopes.decorator.ts.hbs', outputPath: `${outDir}/src/auth/scopes.decorator.ts`, data: spec }));
        rules.push(new ScaffoldFileRule({ id: 'scaffold.auth.scopes_guard', templateName: 'nestjs/auth/scopes.guard.ts.hbs', outputPath: `${outDir}/src/auth/scopes.guard.ts`, data: spec }));
    }

    // Injected Modules
    if (spec.modules) {
        if (spec.modules.some(m => m.type === 'cache.redis' || m.name === 'cache.redis')) {
            rules.push(new ScaffoldFileRule({ id: 'scaffold.injected.redis', templateName: 'modules/redis/redis.module.ts.hbs', outputPath: `${outDir}/src/modules/core/redis/redis.module.ts`, data: spec }));
            rules.push(new EnsureImportRule({ id: 'app.module.import.redis', path: `${outDir}/src/app.module.ts`, moduleName: './modules/core/redis/redis.module.js', namedImports: ['RedisModule'] }));
            rules.push(new EnsureNestModuleRegistrationRule({ id: 'app.module.register.redis', path: `${outDir}/src/app.module.ts`, arrayName: 'imports', symbolName: 'RedisModule' }));
        }
        if (spec.modules.some(m => m.type === 'queue.bullmq' || m.name === 'queue.bullmq')) {
            rules.push(new ScaffoldFileRule({ id: 'scaffold.injected.queue', templateName: 'modules/queue/queue.module.ts.hbs', outputPath: `${outDir}/src/modules/core/queue/queue.module.ts`, data: spec }));
            rules.push(new EnsureImportRule({ id: 'app.module.import.queue', path: `${outDir}/src/app.module.ts`, moduleName: './modules/core/queue/queue.module.js', namedImports: ['QueueModule'] }));
            rules.push(new EnsureNestModuleRegistrationRule({ id: 'app.module.register.queue', path: `${outDir}/src/app.module.ts`, arrayName: 'imports', symbolName: 'QueueModule' }));
        }
    }

    // E4 — Transactional outbox (domain events). Gated on queue + db-transactions.
    // Wired into app.module via the enableOutbox flag (ScheduleModule + OutboxModule).
    if (enableOutbox) {
        const outboxBase = `${outDir}/src/modules/core/outbox`;
        const outboxFiles = [
            ['transaction-context', 'modules/outbox/transaction-context.ts.hbs'],
            ['outbox-event.entity', 'modules/outbox/outbox-event.entity.ts.hbs'],
            ['outbox.service', 'modules/outbox/outbox.service.ts.hbs'],
            ['outbox-relay.service', 'modules/outbox/outbox-relay.service.ts.hbs'],
            ['outbox.processor', 'modules/outbox/outbox.processor.ts.hbs'],
            ['outbox.module', 'modules/outbox/outbox.module.ts.hbs'],
        ];
        for (const [name, tpl] of outboxFiles) {
            const overwrite = name !== 'outbox.processor'; // processor body is @ArchonManual / dev-owned
            rules.push(new ScaffoldFileRule({ id: `scaffold.outbox.${name}`, templateName: tpl, outputPath: `${outboxBase}/${name}.ts`, data: templateData, overwrite }));
        }
        // Outbox table migration (synchronize is off; runs first via 0000_ prefix).
        rules.push(new ScaffoldFileRule({ id: 'scaffold.outbox.migration', templateName: 'nestjs/db/outbox.migration.sql.hbs', outputPath: `${outDir}/scripts/migrations/0000_outbox.sql`, data: templateData }));
    }

    // Platform Shared
    const shared = [
        { tpl: 'platform/shared/config/config.schema.ts.hbs', out: 'src/shared/config/config.schema.ts'},
        { tpl: 'platform/shared/config/config.module.ts.hbs', out: 'src/shared/config/config.module.ts'},
        { tpl: 'platform/shared/logging/logger.module.ts.hbs', out: 'src/shared/logging/logger.module.ts'},
        { tpl: 'platform/shared/logging/pino.options.ts.hbs', out: 'src/shared/logging/pino.options.ts'},
        { tpl: 'platform/shared/middleware/correlation-id.middleware.ts.hbs', out: 'src/shared/middleware/correlation-id.middleware.ts'},
        { tpl: 'platform/shared/filters/http-exception.filter.ts.hbs', out: 'src/shared/filters/http-exception.filter.ts'},
        { tpl: 'platform/shared/interceptors/transform.interceptor.ts.hbs', out: 'src/shared/interceptors/transform.interceptor.ts'},
        { tpl: 'platform/shared/health/health.module.ts.hbs', out: 'src/shared/health/health.module.ts'},
        { tpl: 'platform/shared/health/health.controller.ts.hbs', out: 'src/shared/health/health.controller.ts'},
        { tpl: 'platform/shared/health/health.service.ts.hbs', out: 'src/shared/health/health.service.ts'},
        { tpl: 'platform/shared/swagger/swagger.ts.hbs', out: 'src/shared/swagger/swagger.ts'},
        { tpl: 'nestjs/archon-manual.decorator.ts.hbs', out: 'src/shared/decorators/archon-manual.decorator.ts'}
    ];
    shared.forEach((sh, i) => {
        rules.push(new ScaffoldFileRule({ id: `scaffold.shared.${i}`, templateName: sh.tpl, outputPath: `${outDir}/${sh.out}`, data: templateData }));
    });

    // Base Schema — fully regenerated each run (idempotent DDL) so new
    // entities/fields are reflected when the spec evolves. Kept as a human-readable
    // reference/bootstrap; the RUNTIME source of truth is the versioned migration below.
    rules.push(new ScaffoldFileRule({ id: 'scaffold.schema', templateName: 'nestjs/db/schema.sql.hbs', outputPath: `${outDir}/src/db/schema.sql`, data: { domains: spec.domains }, overwrite: true }));

    // E2 — Versioned migrations (production-safe, lineage-correct without a diff engine).
    // Each migration is a FULL idempotent schema snapshot (CREATE/ALTER IF NOT EXISTS),
    // named by a deterministic content hash of the schema-relevant spec. When the schema
    // changes the hash changes → a NEW migration file is emitted (skip-if-exists keeps the
    // old one) → db:migrate applies it once (filename ledger). Unchanged schema → same
    // filename → already applied → skipped. Order-independent because snapshots are
    // idempotent, so no fragile field-level diff is needed. synchronize is OFF by default
    // (app.module), making these migrations the runtime source of truth.
    const schemaHash = createHash('sha1').update(JSON.stringify(spec.domains || [])).digest('hex').slice(0, 12);
    rules.push(new ScaffoldFileRule({
      id: `scaffold.migration.${schemaHash}`,
      templateName: 'nestjs/db/schema.sql.hbs',
      outputPath: `${outDir}/scripts/migrations/migration_${schemaHash}.sql`,
      data: { domains: spec.domains },
    }));

    if (spec.dependencies) {
        for (const [dep, version] of Object.entries(spec.dependencies)) {
            rules.push(new EnsureJsonValueRule({
                id: `deps.${dep}`,
                path: `${outDir}/package.json`,
                pointer: `/dependencies/${dep}`,
                value: version
            }));
        }
    }

    if (spec.domains) {
        for (const domain of spec.domains) {
            const domainKebab = toKebabCase(domain.key);
            const domainPascal = toPascalCase(domain.key);

            // E5 — repository ports + adapters, one per entity in the domain.
            const domainRepos = (domain.entities || []).map(e => {
                const info = this.getRepoInfo(e);
                return {
                    token: info.token,
                    adapterClass: info.adapterClass,
                    portImport: `./repositories/${info.kebab}.repository`,
                    adapterImport: `./repositories/typeorm-${info.kebab}.repository`,
                };
            });

            // E3 — application use-cases, one per custom (non-CRUD) operation. Registered
            // as providers so controllers can inject them.
            const CRUD_NAMES = ['create', 'findAll', 'findOne', 'update', 'delete'];
            const domainUseCases = (domain.services || []).flatMap(s =>
                (s.operations || []).filter(op => !CRUD_NAMES.includes(op.name)).map(op => ({
                    className: `${toPascalCase(op.name)}UseCase`,
                    importPath: `./use-cases/${toKebabCase(op.name)}.use-case`,
                })),
            );

            // Scaffold Domain Module
            rules.push(new AstMergeRule({
              id: `scaffold.${domainKebab}.module`,
              layer: 4, // module imports controllers + services
              templateName: 'nestjs/module.ts.hbs',
              outputPath: `${outDir}/src/modules/${domainKebab}/${domainKebab}.module.ts`,
              data: {
                  domainName: domain.name,
                  moduleClassName: `${domainPascal}Module`,
                  entities: domain.entities, // Pass full objects now
                  repositories: domainRepos,
                  useCases: domainUseCases,
                  controllers: (domain.services || []).map(s => {
                      const baseName = (s.name || 'Unknown').replace(/Service$/, "");
                      return {
                          className: `${toPascalCase(baseName)}Controller`,
                          importPath: `./controllers/${toKebabCase(baseName)}.controller`
                      };
                  }),
                  services: (domain.services || []).map(s => ({
                      className: `${toPascalCase((s.name || 'Unknown').replace(/Service$/, ''))}Service`,
                      importPath: `./services/${toKebabCase((s.name || 'Unknown').replace(/Service$/, ''))}.service`
                  }))
              }
            }));

            // Scaffold Entities
            for (const entity of (domain.entities || [])) {
                const entityKebab = toKebabCase(entity.name || 'Unknown');

                rules.push(new AstMergeRule({
                    id: `scaffold.entity.${entityKebab}`,
                    layer: 0, // entities are the root of the artifact lattice
                    templateName: 'nestjs/entity.ts.hbs',
                    outputPath: `${outDir}/src/modules/${domainKebab}/entities/${entityKebab}.entity.ts`,
                    data: this.buildEntityData(entity, domain, spec)
                }));

                // E5 — repository port (domain interface + DI token) and TypeORM adapter.
                const repoInfo = this.getRepoInfo(entity);
                const { idType, idName } = this.getIdInfo(entity);
                const repoData = {
                    entity,
                    entityImportPath: `../entities/${entityKebab}.entity`,
                    token: repoInfo.token,
                    portInterface: repoInfo.portInterface,
                    adapterClass: repoInfo.adapterClass,
                    portImport: `./${entityKebab}.repository`,
                    idType,
                    idName,
                };
                rules.push(new ScaffoldFileRule({
                    id: `scaffold.repo.port.${entityKebab}`,
                    templateName: 'nestjs/repository.interface.ts.hbs',
                    outputPath: `${outDir}/src/modules/${domainKebab}/repositories/${entityKebab}.repository.ts`,
                    data: repoData,
                    overwrite: true,
                }));
                rules.push(new ScaffoldFileRule({
                    id: `scaffold.repo.adapter.${entityKebab}`,
                    templateName: 'nestjs/typeorm.repository.ts.hbs',
                    outputPath: `${outDir}/src/modules/${domainKebab}/repositories/typeorm-${entityKebab}.repository.ts`,
                    data: repoData,
                    overwrite: true,
                }));

                rules.push(new AstMergeRule({
                    id: `scaffold.dto.${entityKebab}`,
                    layer: 1, // DTOs derive from entity fields
                    templateName: 'nestjs/dto.ts.hbs',
                    outputPath: `${outDir}/src/modules/${domainKebab}/dtos/create-${entityKebab}.dto.ts`,
                    data: { entity }
                }));

                // Update DTO (typed PATCH bodies via PartialType)
                rules.push(new AstMergeRule({
                    id: `scaffold.dto.update.${entityKebab}`,
                    layer: 1, // update DTO = PartialType(create DTO)
                    templateName: 'nestjs/update-dto.ts.hbs',
                    outputPath: `${outDir}/src/modules/${domainKebab}/dtos/update-${entityKebab}.dto.ts`,
                    data: { entity }
                }));
            }

            // Scaffold Services & Controllers
            for (const service of (domain.services || [])) {
                const baseName = (service.name || 'Unknown').replace(/Service$/, '');
                const fileBase = toKebabCase(baseName);
                const relatedEntity = (domain.entities || []).find(e => e.name === service.entity) || (domain.entities || [])[0] || { name: 'Unknown' };

                const isTransactional = spec.modules?.some(m => m.name === 'db-transactions' || m.type === 'db-transactions');
                const tpl = isTransactional || (service.name || '').includes('Transaction') ? 'nestjs/transactional-service.ts.hbs' : 'nestjs/service.ts.hbs';

                const { idName, idType } = this.getIdInfo(relatedEntity);
                // Default to full CRUD when the service declares no explicit crud array.
                const crudList: string[] = Array.isArray(service.crud)
                    ? service.crud
                    : ['create', 'findAll', 'findOne', 'update', 'delete'];
                const crud = {
                    create: crudList.includes('create'),
                    findAll: crudList.includes('findAll'),
                    findOne: crudList.includes('findOne'),
                    update: crudList.includes('update'),
                    delete: crudList.includes('delete'),
                };

                // E5 — the service depends on its entity's repository PORT (interface +
                // token), not on TypeORM directly.
                const svcRepo = this.getRepoInfo(relatedEntity);
                const repoPortImport = `../repositories/${svcRepo.kebab}.repository`;

                rules.push(new AstMergeRule({
                    id: `scaffold.service.${fileBase}`,
                    layer: 2, // services import entity + dtos
                    templateName: tpl,
                    outputPath: `${outDir}/src/modules/${domainKebab}/services/${fileBase}.service.ts`,
                    data: {
                        service: {
                            ...service,
                            crud: crudList,
                            operations: (service.operations || [])
                                .filter(op => !['create', 'findAll', 'findOne', 'update', 'delete'].includes(op.name))
                                .map(op => ({
                                    ...op,
                                    // Stub param is prefixed `_` so the generated (unimplemented) method
                                    // passes the project's strict no-unused-vars lint until a dev fills it in.
                                    params: op.params || (/create/i.test(op.name) ? `_dto: Create${relatedEntity.name}Dto` : '_dto: any'),
                                    returnType: op.returnType || `Promise<${op.name === 'findAll' ? relatedEntity.name + '[]' : 'any'}>`
                                }))
                        },
                        serviceClassName: `${toPascalCase((service.name || 'Unknown').replace(/Service$/, ''))}Service`,
                        entity: relatedEntity,
                        entityImportPath: `../entities/${toKebabCase(relatedEntity.name)}.entity`,
                        relatedEntities: [],
                        repoPort: svcRepo.portInterface,
                        repoToken: svcRepo.token,
                        repoPortImport,
                        crud,
                        idType,
                        idName
                    }
                }));

                // E3 — enrich custom ops once; each becomes an application use-case the
                // controller injects + calls (instead of a stub method on the service).
                const enrichedOps = this.enrichControllerOperations(service.operations || [], domain.key, relatedEntity);
                const serviceUseCases = enrichedOps.map(op => ({
                    className: op.useCaseClass,
                    prop: op.useCaseProp,
                    importPath: `../use-cases/${toKebabCase(op.name)}.use-case`,
                }));

                // Generate one use-case file per custom operation (skip-if-exists: the dev
                // owns the execute() body after first generation).
                for (const op of enrichedOps) {
                    rules.push(new ScaffoldFileRule({
                        id: `scaffold.usecase.${toKebabCase(op.name)}`,
                        templateName: 'nestjs/use-case.ts.hbs',
                        outputPath: `${outDir}/src/modules/${domainKebab}/use-cases/${toKebabCase(op.name)}.use-case.ts`,
                        data: {
                            opName: op.name,
                            useCaseClass: op.useCaseClass,
                            entityName: relatedEntity.name,
                            repoPort: svcRepo.portInterface,
                            repoToken: svcRepo.token,
                            repoPortImport,
                            commandType: 'any',
                            returnType: op.returnType || 'Promise<any>',
                        },
                    }));
                }

                rules.push(new AstMergeRule({
                    id: `scaffold.controller.${fileBase}`,
                    layer: 3, // controllers import service + dtos + entity
                    templateName: 'nestjs/controller.ts.hbs',
                    outputPath: `${outDir}/src/modules/${domainKebab}/controllers/${fileBase}.controller.ts`,
                    data: {
                        ...templateData,
                        service,
                        controllerClassName: `${toPascalCase(baseName)}Controller`,
                        serviceClassName: `${toPascalCase(baseName)}Service`,
                        serviceImportPath: `../services/${fileBase}.service`,
                        entity: relatedEntity,
                        entityImportPath: `../entities/${toKebabCase(relatedEntity.name)}.entity`,
                        domainKey: domain.key,
                        crud,
                        crudScopes: {
                            create: [`${domain.key}:write`],
                            findAll: [`${domain.key}:read`],
                            findOne: [`${domain.key}:read`],
                            update: [`${domain.key}:write`],
                            delete: [`${domain.key}:write`],
                        },
                        operations: enrichedOps,
                        useCases: serviceUseCases,
                        idType
                    }
                }));

                // E1 — Generated test scaffolds. ScaffoldFileRule = skip-if-exists, so
                // the dev OWNS the spec after first generation (the engine never
                // overwrites it on regen). This sidesteps the merge engine's inability
                // to reconcile top-level Jest describe/it blocks.
                rules.push(new ScaffoldFileRule({
                    id: `scaffold.service.spec.${fileBase}`,
                    templateName: 'nestjs/service.spec.ts.hbs',
                    outputPath: `${outDir}/src/modules/${domainKebab}/services/${fileBase}.service.spec.ts`,
                    data: {
                        serviceClassName: `${toPascalCase((service.name || 'Unknown').replace(/Service$/, ''))}Service`,
                        serviceFileBase: fileBase,
                        entity: relatedEntity,
                        repoToken: svcRepo.token,
                        repoPortImport,
                        crud,
                        idName,
                        idType,
                        isTransactional,
                        needsNotFound: crud.findOne || crud.delete,
                    }
                }));

                rules.push(new ScaffoldFileRule({
                    id: `scaffold.controller.spec.${fileBase}`,
                    templateName: 'nestjs/controller.spec.ts.hbs',
                    outputPath: `${outDir}/src/modules/${domainKebab}/controllers/${fileBase}.controller.spec.ts`,
                    data: {
                        controllerClassName: `${toPascalCase(baseName)}Controller`,
                        controllerFileBase: fileBase,
                        serviceClassName: `${toPascalCase(baseName)}Service`,
                        serviceFileBase: fileBase,
                        useCases: serviceUseCases,
                        crud,
                    }
                }));
            }

            // App Module Integrations
            rules.push(new EnsureImportRule({
              id: `app.module.import.${domainKebab}`,
              path: `${outDir}/src/app.module.ts`,
              moduleName: `./modules/${domainKebab}/${domainKebab}.module`,
              namedImports: [`${domainPascal}Module`]
            }));

            rules.push(new EnsureNestModuleRegistrationRule({
              id: `app.module.register.${domainKebab}`,
              path: `${outDir}/src/app.module.ts`,
              arrayName: 'imports',
              symbolName: `${domainPascal}Module`
            }));
        }
    }

    return rules;
  }
}
