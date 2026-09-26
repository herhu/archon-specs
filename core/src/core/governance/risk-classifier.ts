import { ExecutionPlan, ExecutionOperation } from '../engine/execution-plan';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export class RiskClassifier {
    static classify(operations: ExecutionOperation[]): { level: RiskLevel, requiresApproval: boolean } {
        let maxRisk: RiskLevel = 'LOW';

        for (const op of operations) {
            const risk = this.classifyPath(op.path);
            if (this.riskToPriority(risk) > this.riskToPriority(maxRisk)) {
                maxRisk = risk;
            }
            if (maxRisk === 'HIGH') break;
        }

        // Impact-based escalation: many operations increase risk
        if (maxRisk === 'LOW' && operations.length > 5) maxRisk = 'MEDIUM';
        if (maxRisk === 'MEDIUM' && operations.length > 15) maxRisk = 'HIGH';

        return {
            level: maxRisk,
            requiresApproval: maxRisk !== 'LOW'
        };
    }

    private static classifyPath(path: string): RiskLevel {
        // HIGH: Core infrastructure and security
        if (
            path.startsWith('.archon/') || 
            path.startsWith('src/core/') || 
            path.includes('package.json') || 
            path.includes('main.ts') || 
            path.includes('nest-cli.json') ||
            path.includes('docker') ||
            path.includes('environment')
        ) {
            return 'HIGH';
        }

        // MEDIUM: Business Logic
        if (
            path.includes('/services/') || 
            path.includes('/controllers/') || 
            path.includes('/modules/') ||
            path.includes('/gateways/')
        ) {
            return 'MEDIUM';
        }

        // LOW: Boilerplate / Data structures
        if (
            path.includes('/dto/') || 
            path.includes('/entities/') || 
            path.includes('/schemas/') ||
            path.endsWith('.md')
        ) {
            return 'LOW';
        }

        return 'MEDIUM'; // Default to cautious
    }

    private static riskToPriority(risk: RiskLevel): number {
        switch (risk) {
            case 'HIGH': return 3;
            case 'MEDIUM': return 2;
            case 'LOW': return 1;
        }
    }
}
