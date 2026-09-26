import { Project, SyntaxKind } from 'ts-morph';
import * as path from 'path';
import { RepairProposal } from './repair-generator';
import { DesignSpec } from '../state/spec';
import { TelemetryEmitter } from '../telemetry/telemetry';
import { EventType, EventCategory } from '../telemetry/telemetry-schema';

/**
 * RepairEngine: The "Immune System" that executes self-healing code mutations.
 */
export class RepairEngine {
    private project: Project;

    constructor(private readonly outDir: string) {
        this.project = new Project();
    }

    async applyRepairs(spec: DesignSpec, proposals: RepairProposal[], traceId: string): Promise<{ success: number, failed: number }> {
        let success = 0;
        let failed = 0;

        for (const proposal of proposals) {
            if (!proposal.isAutoFixable) continue;

            try {
                const result = await this.executeRepair(spec, proposal);
                if (result) {
                    success++;
                    TelemetryEmitter.emit({
                        event: 'REPAIR_SUCCEEDED',
                        eventType: EventType.STATE_SAVED,
                        eventCategory: EventCategory.GOVERNANCE,
                        metadata: { traceId, drift: proposal.drift, action: proposal.action }
                    });
                } else {
                    failed++;
                }
            } catch (err: any) {
                failed++;
                console.error(`[RepairEngine] Failed to apply repair: ${err.message}`);
                TelemetryEmitter.emit({
                    event: 'REPAIR_FAILED',
                    eventType: EventType.ORCHESTRATION_FAILED,
                    eventCategory: EventCategory.GOVERNANCE,
                    metadata: { traceId, drift: proposal.drift, error: err.message }
                });
            }
        }

        if (success > 0) {
            await this.project.save();
        }

        return { success, failed };
    }

    private async executeRepair(spec: DesignSpec, proposal: RepairProposal): Promise<boolean> {
        const { drift, action } = proposal;
        const pathParts = drift.path.split('.'); // e.g. entities.User.fields.email
        const entityName = pathParts[1];
        const fieldName = pathParts[3];

        // Find the entity file
        // Note: In a real implementation, we would use the domain mapping. 
        // For now, we search the common entity pattern.
        const entityFiles = path.join(this.outDir, 'src', 'modules', '**', 'entities', `${entityName.toLowerCase()}.entity.ts`);
        this.project.addSourceFilesAtPaths(entityFiles);
        const sourceFile = this.project.getSourceFiles().find(f => f.getClasses().some(c => c.getName() === entityName));

        if (!sourceFile) return false;
        const cls = sourceFile.getClass(entityName);
        if (!cls) return false;

        switch (action) {
            case 'REGENERATE_FIELD': {
                // Find field in spec
                const domain = spec.domains.find(d => d.entities.some(e => e.name === entityName));
                const entitySpec = domain?.entities.find(e => e.name === entityName);
                const fieldSpec = entitySpec?.fields.find(f => f.name === fieldName);

                if (fieldSpec) {
                    cls.addProperty({
                        name: fieldName,
                        type: fieldSpec.type,
                        decorators: [{
                            name: 'Column',
                            arguments: []
                        }]
                    });
                    return true;
                }
                break;
            }
            case 'ALIGN_TYPE': {
                const prop = cls.getProperty(fieldName);
                if (prop) {
                    prop.setType(drift.expected || 'string');
                    return true;
                }
                break;
            }
        }

        return false;
    }
}
