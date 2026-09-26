import { DriftRecord, DriftType } from './diff-engine';
import { RuleResult } from '../../rules/rule-result';
import { DesignSpec } from '../state/spec';

export interface RepairProposal {
    drift: DriftRecord;
    action: string;
    description: string;
    isAutoFixable: boolean;
}

/**
 * RepairGenerator: Converts structural drift into actionable repair strategies.
 */
export class RepairGenerator {
    static generateProposals(drifts: DriftRecord[]): RepairProposal[] {
        return drifts.map(drift => {
            switch (drift.type) {
                case DriftType.MISSING_FIELD:
                    return {
                        drift,
                        action: 'REGENERATE_FIELD',
                        description: `The field '${drift.path.split('.').pop()}' is missing from the entity. Archon can automatically restore it using the original template.`,
                        isAutoFixable: true
                    };
                case DriftType.TYPE_MISMATCH:
                    return {
                        drift,
                        action: 'ALIGN_TYPE',
                        description: `Type mismatch detected in '${drift.path}'. Spec expects ${drift.expected}, but code uses ${drift.actual}. Archon can force-align the TypeScript type.`,
                        isAutoFixable: true
                    };
                case DriftType.EXTRA_FIELD:
                    return {
                        drift,
                        action: 'MANUAL_REVIEW',
                        description: `Extra field '${drift.path.split('.').pop()}' found in code. This might be manual logic. Archon will NOT delete this automatically to prevent data loss. Please review or update the DesignSpec.`,
                        isAutoFixable: false
                    };
                case DriftType.MISSING_ENTITY:
                    return {
                        drift,
                        action: 'REGENERATE_ENTITY',
                        description: `The entire entity '${drift.path.split('.').pop()}' is missing. Archon can re-run the scaffolding for this module.`,
                        isAutoFixable: true
                    };
                default:
                    return {
                        drift,
                        action: 'NOTIFY',
                        description: `Unknown drift detected at ${drift.path}.`,
                        isAutoFixable: false
                    };
            }
        });
    }
}
