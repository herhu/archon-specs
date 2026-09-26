import { DesignSpec } from '../state/spec';
import { ProbedSpec, ProbedEntity, ProbedField } from './prober';

export enum DriftType {
    MISSING_ENTITY = 'MISSING_ENTITY',
    EXTRA_ENTITY = 'EXTRA_ENTITY',
    MISSING_FIELD = 'MISSING_FIELD',
    EXTRA_FIELD = 'EXTRA_FIELD',
    TYPE_MISMATCH = 'TYPE_MISMATCH'
}

export interface DriftRecord {
    type: DriftType;
    path: string;
    expected?: string;
    actual?: string;
    severity: 'high' | 'medium' | 'low';
}

/**
 * DiffEngine: Calculates the delta between Intended Architecture and Current Reality.
 */
export class DiffEngine {
    compare(intent: DesignSpec, reality: ProbedSpec): DriftRecord[] {
        const drifts: DriftRecord[] = [];

        const intendedEntities = new Map<string, any>();
        intent.domains.forEach(d => {
            d.entities.forEach(e => intendedEntities.set(e.name, { ...e, domainName: d.name }));
        });

        const actualEntities = new Map<string, ProbedEntity>();
        reality.domains.forEach(d => {
            d.entities.forEach(e => actualEntities.set(e.name, e));
        });

        // 1. Check for missing or modified entities
        intendedEntities.forEach((intended, name) => {
            const actual = actualEntities.get(name);
            if (!actual) {
                drifts.push({
                    type: DriftType.MISSING_ENTITY,
                    path: `domains.${intended.domainName}.entities.${name}`,
                    expected: 'exists',
                    actual: 'missing',
                    severity: 'high'
                });
                return;
            }

            this.compareFields(intended, actual, drifts);
        });

        // 2. Check for extra entities (Architectural Noise)
        actualEntities.forEach((actual, name) => {
            if (!intendedEntities.has(name)) {
                drifts.push({
                    type: DriftType.EXTRA_ENTITY,
                    path: `entities.${name}`,
                    expected: 'not in spec',
                    actual: 'exists',
                    severity: 'low'
                });
            }
        });

        return drifts;
    }

    private compareFields(intended: any, actual: ProbedEntity, drifts: DriftRecord[]) {
        const intendedFields = new Map(intended.fields.map((f: any) => [f.name, f]));
        const actualFields = new Map(actual.fields.map(f => [f.name, f]));

        intendedFields.forEach((inf: any, name: string) => {
            const actf = actualFields.get(name);
            if (!actf) {
                drifts.push({
                    type: DriftType.MISSING_FIELD,
                    path: `entities.${actual.name}.fields.${name}`,
                    expected: 'exists',
                    actual: 'missing',
                    severity: 'high'
                });
                return;
            }

            // Simple type normalization for comparison
            const normIntended = this.normalizeType(inf.type);
            const normActual = this.normalizeType(actf.type);

            if (normIntended !== normActual && normIntended !== 'any') {
                 drifts.push({
                    type: DriftType.TYPE_MISMATCH,
                    path: `entities.${actual.name}.fields.${name}`,
                    expected: normIntended,
                    actual: normActual,
                    severity: 'medium'
                });
            }
        });

        // Check for extra fields (Architectural Noise)
        actualFields.forEach((actf, name) => {
            if (!intendedFields.has(name)) {
                drifts.push({
                    type: DriftType.EXTRA_FIELD,
                    path: `entities.${actual.name}.fields.${name}`,
                    expected: 'not in spec',
                    actual: 'exists',
                    severity: 'low'
                });
            }
        });
    }

    private normalizeType(type: string): string {
        const t = type.toLowerCase();
        if (t === 'uuid' || t === 'string' || t.includes('string')) return 'string';
        if (t === 'number' || t === 'int' || t === 'float') return 'number';
        if (t === 'boolean') return 'boolean';
        if (t === 'date' || t.includes('date')) return 'date';
        return type;
    }
}
