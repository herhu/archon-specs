import * as path from "path";
import * as fs from "fs-extra";
import { DesignSpec } from '../state/spec';
import { templateEngine, toSnakeCase } from '../vfs/template-engine';
import { writeArtifact, WriteResult } from '../vfs/io';
import { TypedDelta } from '../engine/change-planner';

async function getNextMigrationNumber(outDir: string): Promise<string> {
  const migrationsDir = path.join(outDir, "scripts/migrations");
  if (!fs.existsSync(migrationsDir)) return "001";
  const files = fs.readdirSync(migrationsDir);
  const numbers = files.map((f) => parseInt(f.split("_")[0])).filter((n) => !isNaN(n));
  return numbers.length === 0 ? "001" : (Math.max(...numbers) + 1).toString().padStart(3, "0");
}

export async function generateMigrationArtifact(
  spec: DesignSpec,
  outDir: string,
  tplDir: string,
  dryRun: boolean,
  deltas: TypedDelta[],
  oldSpec: DesignSpec | null,
): Promise<WriteResult[]> {
  const results: WriteResult[] = [];
  const nextNum = await getNextMigrationNumber(outDir);
  const migrationName = oldSpec ? `update_schema_${nextNum}` : "initial_schema";
  const filePath = path.join(outDir, "scripts/migrations", `${nextNum}_${migrationName}.sql`);

  const migrationTpl = await fs.readFile(path.join(tplDir, "nestjs/db/migration.sql.hbs"), "utf-8");
  const sqlChanges: any[] = [];

  if (!oldSpec) {
    for (const domain of spec.domains) {
      for (const entity of domain.entities) {
        sqlChanges.push({
          type: "CreateTable",
          tableName: toSnakeCase(entity.name),
          fields: entity.fields,
          indexes: entity.indexes,
          partitionBy: entity.partitionBy
        });
      }
    }
  } else {
    for (const delta of deltas) {
      if (delta.type === "EntityAdded") {
        const entity = spec.domains.find(d => d.key === delta.domainKey)?.entities.find(e => e.name === delta.entityName);
        if (entity) sqlChanges.push({ type: "CreateTable", tableName: toSnakeCase(entity.name), fields: entity.fields, indexes: entity.indexes, partitionBy: entity.partitionBy });
      } else if (delta.type === "EntityUpdated") {
        const oldEntity = oldSpec.domains.find(d => d.key === delta.domainKey)?.entities.find(e => e.name === delta.entityName);
        const newEntity = spec.domains.find(d => d.key === delta.domainKey)?.entities.find(e => e.name === delta.entityName);
        if (oldEntity && newEntity) {
          for (const field of newEntity.fields) {
            const oldField = oldEntity.fields.find(f => f.name === field.name);
            if (!oldField) {
              sqlChanges.push({ type: "AddColumn", tableName: toSnakeCase(newEntity.name), columnName: field.name, columnType: field.type, nullable: field.nullable, unique: field.unique, references: field.references, index: field.index });
            } else {
              if (!oldField.references && field.references) sqlChanges.push({ type: "AddForeignKey", tableName: toSnakeCase(newEntity.name), columnName: field.name, references: field.references, constraintName: `fk_${toSnakeCase(newEntity.name)}_${field.name}` });
              if (!oldField.index && field.index) sqlChanges.push({ type: "AddIndex", tableName: toSnakeCase(newEntity.name), indexName: `idx_${toSnakeCase(newEntity.name)}_${field.name}`, fields: [field.name] });
            }
          }
          const newIndexes = newEntity.indexes || [];
          for (const newIdx of newIndexes) {
            if (!(oldEntity.indexes || []).find(oldIdx => JSON.stringify(oldIdx.fields) === JSON.stringify(newIdx.fields) && oldIdx.unique === newIdx.unique)) {
              sqlChanges.push({ type: "AddIndex", tableName: toSnakeCase(newEntity.name), indexName: newIdx.name || `idx_${toSnakeCase(newEntity.name)}_${newIdx.fields.join("_")}`, fields: newIdx.fields, unique: newIdx.unique });
            }
          }
        }
      }
    }
  }

  if (sqlChanges.length === 0) return results;
  results.push(await writeArtifact(filePath, templateEngine.render(migrationTpl, { migrationName, generatedAt: new Date().toISOString(), changes: sqlChanges }), dryRun));
  return results;
}
