import * as path from "path";
import * as fs from "fs-extra";
import { DesignSpec, Domain, Entity, Service } from '../state/spec';
import { templateEngine, toKebabCase, toPascalCase, toCamelCase } from '../vfs/template-engine';
import { writeArtifact, WriteResult } from '../vfs/io';
import { logger } from '../telemetry/logger';
import { toKebab, normalizeService, kebab } from './util';

export async function generateDomainModuleArtifact(
  domain: Domain,
  outDir: string,
  tplDir: string,
  dryRun: boolean,
): Promise<WriteResult> {
  const domainKebab = toKebabCase(domain.key);
  const domainDir = path.join(outDir, "src/modules", domainKebab);
  const normalizedServices = domain.services.map((s) => normalizeService(s));

  const moduleTpl = await fs.readFile(path.join(tplDir, "nestjs/module.ts.hbs"), "utf-8");
  const moduleContent = templateEngine.render(moduleTpl, {
    domainName: domain.name,
    moduleClassName: toPascalCase(domain.key) + "Module",
    controllers: normalizedServices.map((s) => ({
      className: s.controllerClassName,
      importPath: s.importPathController,
    })),
    services: normalizedServices.map((s) => ({
      className: s.serviceClassName,
      importPath: s.importPathService,
    })),
    entities: domain.entities.map((e) => e.name),
  });
  return await writeArtifact(path.join(domainDir, `${domainKebab}.module.ts`), moduleContent, dryRun);
}

export async function generateEntityArtifact(
  domain: Domain,
  entity: Entity,
  outDir: string,
  tplDir: string,
  dryRun: boolean,
  spec: DesignSpec,
): Promise<WriteResult> {
  const domainKebab = toKebabCase(domain.key);
  const domainDir = path.join(outDir, "src/modules", domainKebab);

  const getImportPath = (targetName: string) => {
    const targetDomain = spec.domains.find(d => d.entities.some(e => e.name === targetName));
    if (!targetDomain || targetDomain.key === domain.key) return `./${toKebab(targetName)}.entity`;
    return `../../${toKebab(targetDomain.key)}/entities/${toKebab(targetName)}.entity`;
  };

  const effectiveRelationships = [...(entity.relationships || [])];
  entity.fields.forEach(field => {
    if (field.references) {
      const exists = effectiveRelationships.some(r => r.joinColumn === field.name || r.name === toCamelCase(field.references!.entity));
      if (!exists) {
        effectiveRelationships.push({
          name: toCamelCase(field.references!.entity),
          type: 'manyToOne',
          targetEntity: field.references!.entity,
          joinColumn: field.name
        });
      }
    }
  });

  const entityTpl = await fs.readFile(path.join(tplDir, "nestjs/entity.ts.hbs"), "utf-8");
  const relatedEntities = effectiveRelationships.map(r => ({
    name: r.targetEntity,
    importPath: getImportPath(r.targetEntity)
  }));

  // FK columns are emitted by the relationship block; skip them in the plain
  // fields loop to avoid duplicate column declarations.
  const joinColumns = new Set(
    effectiveRelationships.map(r => r.joinColumn).filter(Boolean) as string[],
  );
  const annotatedFields = entity.fields.map(f => ({ ...f, isFkColumn: joinColumns.has(f.name) }));
  const hasCreatedAt = entity.fields.some(f => f.name === "createdAt");
  const hasUpdatedAt = entity.fields.some(f => f.name === "updatedAt");

  const content = templateEngine.render(entityTpl, {
    entity: { ...entity, fields: annotatedFields, relationships: effectiveRelationships },
    relatedEntities,
    hasCreatedAt,
    hasUpdatedAt,
  });
  return await writeArtifact(path.join(domainDir, "entities", `${toKebab(entity.name)}.entity.ts`), content, dryRun);
}

export async function generateDtoArtifact(
  domain: Domain,
  entity: Entity,
  outDir: string,
  tplDir: string,
  dryRun: boolean,
): Promise<WriteResult> {
  const domainKebab = toKebabCase(domain.key);
  const domainDir = path.join(outDir, "src/modules", domainKebab);
  const dtoTpl = await fs.readFile(path.join(tplDir, "nestjs/dto.ts.hbs"), "utf-8");
  const createResult = await writeArtifact(
    path.join(domainDir, "dtos", `create-${toKebab(entity.name)}.dto.ts`),
    templateEngine.render(dtoTpl, { entity }),
    dryRun,
  );

  // Update DTO (PartialType of the create DTO) — enables typed PATCH bodies.
  const updateTpl = await fs.readFile(path.join(tplDir, "nestjs/update-dto.ts.hbs"), "utf-8");
  await writeArtifact(
    path.join(domainDir, "dtos", `update-${toKebab(entity.name)}.dto.ts`),
    templateEngine.render(updateTpl, { entity }),
    dryRun,
  );

  return createResult;
}

export async function generateServiceArtifact(
  domain: Domain,
  service: Service,
  outDir: string,
  tplDir: string,
  dryRun: boolean,
  spec: DesignSpec,
): Promise<WriteResult> {
  const domainKebab = toKebabCase(domain.key);
  const domainDir = path.join(outDir, "src/modules", domainKebab);

  const isTransactional = service.name.includes('Transaction') || 
                         (spec.modules && (spec.modules as any).some((m: any) => m.name === 'db-transactions' || m.type === 'db-transactions'));
  
  const serviceTplFile = isTransactional ? "nestjs/transactional-service.ts.hbs" : "nestjs/service.ts.hbs";
  const serviceTpl = await fs.readFile(path.join(tplDir, serviceTplFile), "utf-8");
  
  let relatedEntity = domain.entities[0];
  if (service.entity) {
    relatedEntity = domain.entities.find((e) => e.name === service.entity) || relatedEntity;
  }

  const norm = normalizeService(service);
  const primaryField = relatedEntity.fields.find((f) => f.primary);
  const idType = primaryField?.type === "int" ? "number" : "string";
  const idName = relatedEntity.primaryKey || primaryField?.name || "id";

  const relatedEntitiesMap: Record<string, any> = {};
  [
    ...relatedEntity.fields.filter(f => f.references).map(f => ({ name: f.references!.entity })),
    ...(relatedEntity.relationships || []).map(r => ({ name: r.targetEntity }))
  ].forEach(e => {
    relatedEntitiesMap[e.name] = e;
  });

  const getEntityImportPath = (targetName: string) => {
    const targetDomain = spec.domains.find(d => d.entities.some(e => e.name === targetName));
    if (!targetDomain || targetDomain.key === domain.key) return `../entities/${toKebab(targetName)}.entity`;
    return `../../${toKebab(targetDomain.key)}/entities/${toKebab(targetName)}.entity`;
  };

  const relatedEntities = Object.values(relatedEntitiesMap).map((e: any) => ({
    ...e,
    importPath: getEntityImportPath(e.name)
  }));

  const isSchedule = relatedEntity.fields.some(f => f.name === 'startTime' || f.name === 'checkIn' || f.name === 'checkin') && 
                     relatedEntity.fields.some(f => f.name === 'endTime' || f.name === 'checkOut' || f.name === 'checkout');
  const hasStatus = relatedEntity.fields.some(f => f.name === 'status');

  const enrichedOperations = (service.operations || []).map(op => {
    const defaultReturnType = op.name === 'findAll' ? `${relatedEntity.name}[]` : 'any';
    let returnType = op.returnType || `Promise<${defaultReturnType}>`;
    
    // Ensure returnType is not double wrapped and not HTML escaped
    if (returnType.includes('&lt;') || returnType.includes('&gt;')) {
        returnType = returnType.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    }

    return {
      ...op,
      params: op.params || (op.method === 'GET' || op.method === 'DELETE' ? 'dto: any' : `dto: any`),
      returnType: returnType
    };
  });

  const content = templateEngine.render(serviceTpl, {
    service: { ...service, operations: enrichedOperations },
    serviceClassName: norm.serviceClassName,
    entity: relatedEntity,
    entityImportPath: `../entities/${kebab(relatedEntity.name)}.entity`,
    relatedEntities,
    idType, idName, isSchedule, hasStatus,
  });
  return await writeArtifact(path.join(domainDir, "services", `${norm.serviceFileName}.ts`), content, dryRun);
}

export async function generateControllerArtifact(
  domain: Domain,
  service: Service,
  outDir: string,
  tplDir: string,
  dryRun: boolean,
): Promise<WriteResult> {
  const domainKebab = toKebabCase(domain.key);
  const domainDir = path.join(outDir, "src/modules", domainKebab);
  const controllerTpl = await fs.readFile(path.join(tplDir, "nestjs/controller.ts.hbs"), "utf-8");

  let relatedEntity = domain.entities[0];
  if (service.entity) {
    relatedEntity = domain.entities.find((e) => e.name === service.entity) || relatedEntity;
  }

  const crudFlags = {
    create: service.crud?.includes("create"),
    findAll: service.crud?.includes("findAll"),
    findOne: service.crud?.includes("findOne"),
    update: service.crud?.includes("update"),
    delete: service.crud?.includes("delete"),
  };

  const crudScopes = {
    create: [`${domain.key}:write`],
    findAll: [`${domain.key}:read`],
    findOne: [`${domain.key}:read`],
    update: [`${domain.key}:write`],
    delete: [`${domain.key}:write`],
  };

  const operations = service.operations?.map((op) => {
    // Extract path parameters
    const pathParams = op.path.split('/').filter(p => p.startsWith(':')).map(p => p.substring(1));
    const controllerParams: string[] = [];
    const serviceArgs: string[] = [];

    pathParams.forEach(p => {
      controllerParams.push(`@Param('${p}') ${p}: string`);
      serviceArgs.push(`${p}`);
    });

    if (op.method !== 'GET' && op.method !== 'DELETE') {
      controllerParams.push(`@Body() dto: any`);
      serviceArgs.push('...dto');
    }

    const serviceCallParams = serviceArgs.length > 0 ? `{ ${serviceArgs.join(', ')} }` : '{}';

    return {
      ...op,
      authRequired: op.authz?.required !== false,
      effectiveScopes: op.authz?.scopesAll?.length ? op.authz.scopesAll : [`${domain.key}:${op.method === "GET" ? "read" : "write"}`],
      controllerParams: controllerParams.join(', '),
      serviceCallParams
    };
  });

  const norm = normalizeService(service);
  const content = templateEngine.render(controllerTpl, {
    service,
    controllerClassName: norm.controllerClassName,
    serviceClassName: norm.serviceClassName,
    serviceImportPath: `../services/${norm.serviceFileName}`,
    entity: relatedEntity,
    entityImportPath: `../entities/${kebab(relatedEntity.name)}.entity`,
    domainKey: domain.key,
    crud: crudFlags,
    crudScopes,
    operations: operations,
    idType: relatedEntity.fields.find((f) => f.primary)?.type === "int" ? "number" : "string",
  });
  return await writeArtifact(path.join(domainDir, "controllers", `${norm.controllerFileName}.ts`), content, dryRun);
}

export async function generateDomain(
  domain: Domain,
  outDir: string,
  tplDir: string,
  dryRun: boolean,
  spec: DesignSpec,
): Promise<WriteResult[]> {
  logger.debug({ domain: domain.key }, `Phase: Generating Domain core: ${domain.key}`);
  const results: WriteResult[] = [];
  results.push(await generateDomainModuleArtifact(domain, outDir, tplDir, dryRun));
  for (const entity of domain.entities) {
    results.push(await generateEntityArtifact(domain, entity, outDir, tplDir, dryRun, spec));
    results.push(await generateDtoArtifact(domain, entity, outDir, tplDir, dryRun));
  }
  for (const service of domain.services) {
    results.push(await generateServiceArtifact(domain, service, outDir, tplDir, dryRun, spec));
    results.push(await generateControllerArtifact(domain, service, outDir, tplDir, dryRun));
  }
  return results;
}
