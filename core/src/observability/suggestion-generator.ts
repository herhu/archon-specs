import { CrossTraceIntelligence } from './intelligence-engine';
import { EventCategory, EventType } from '../core/telemetry/telemetry-schema';
import { TelemetryEmitter } from '../core/telemetry/telemetry';

export type SuggestionType = 'OPTIMIZATION' | 'FIX' | 'REFACTOR';

export interface Suggestion {
    id: string;
    type: SuggestionType;
    target: string;
    reason: string;
    suggestedAction: string;
    impact: 'high' | 'medium' | 'low';
    timestamp: string;
}

/**
 * SuggestionGenerator: Transforms patterns into actionable architectural improvements.
 */
export class SuggestionGenerator {
    static generate(intelligence: CrossTraceIntelligence): Suggestion[] {
        const suggestions: Suggestion[] = [];

        // 1. Analyze Recurring Failures
        intelligence.recurringIssues.filter(i => i.type === 'failure').forEach(issue => {
            if (issue.severity === 'high') {
                suggestions.push({
                    id: `sug-${Math.random().toString(36).substring(2, 10)}`,
                    type: 'FIX',
                    target: issue.target,
                    reason: `Critical tool failure detected across ${Math.round(issue.frequency * 100)}% of recent missions.`,
                    suggestedAction: 'Review input validation and error handling in this tool. Consider increasing timeout or memory allocation.',
                    impact: 'high',
                    timestamp: new Date().toISOString()
                });
            }
        });

        // 2. Analyze Drift Patterns
        intelligence.recurringIssues.filter(i => i.type === 'drift').forEach(issue => {
            suggestions.push({
                id: `sug-${Math.random().toString(36).substring(2, 10)}`,
                type: 'OPTIMIZATION',
                target: issue.target,
                reason: `Recurring drift detected in this artifact. It is modified manually more than via Archon.`,
                suggestedAction: 'Consider marking this artifact as "unmanaged" or updating the DesignSpec to reflect its current evolved state.',
                impact: 'medium',
                timestamp: new Date().toISOString()
            });
        });

        // 3. Analyze Stability
        intelligence.artifactStability.filter(s => s.stabilityScore < 0.5).forEach(art => {
            suggestions.push({
                id: `sug-${Math.random().toString(36).substring(2, 10)}`,
                type: 'REFACTOR',
                target: art.path,
                reason: `Low stability score (${Math.round(art.stabilityScore * 100)}%). This file is a mutation hotspot.`,
                suggestedAction: 'Consider splitting this artifact into smaller, more focused modules to reduce the impact of mutations.',
                impact: 'medium',
                timestamp: new Date().toISOString()
            });
        });

        // Emit telemetry for new suggestions
        suggestions.forEach(s => {
            TelemetryEmitter.emit({
                event: 'SUGGESTION_GENERATED',
                eventType: EventType.SUGGESTION_GENERATED,
                eventCategory: EventCategory.INTELLIGENCE,
                metadata: { ...s }
            });
        });

        return suggestions;
    }
}
