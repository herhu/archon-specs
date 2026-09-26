import { DesignSpec } from './spec';
import { HashUtil } from '../utils/hash-util';

export interface SpecDelta {
    impactedCapsuleIds: string[];
    isFullRegeneration: boolean;
    reason: string;
}

export class SpecDeltaEngine {
    static compute(oldSpec: DesignSpec | undefined, newSpec: DesignSpec): SpecDelta {
        if (!oldSpec) {
            return {
                impactedCapsuleIds: [],
                isFullRegeneration: true,
                reason: "Initial generation: No previous spec found."
            };
        }

        const impacted: Set<string> = new Set();
        
        // 1. Check Platform
        if (HashUtil.calculateHash(JSON.stringify(oldSpec.platform || {})) !== HashUtil.calculateHash(JSON.stringify(newSpec.platform || {}))) {
            impacted.add('platform');
            impacted.add('scaffolder');
        }

        // 2. Check Domains (Capsules)
        const oldDomains = new Map(oldSpec.domains.map(d => [d.key, d]));
        const newDomains = new Map(newSpec.domains.map(d => [d.key, d]));

        // New or Changed Domains
        for (const [key, newDomain] of newDomains) {
            const oldDomain = oldDomains.get(key);
            if (!oldDomain || HashUtil.calculateHash(JSON.stringify(oldDomain)) !== HashUtil.calculateHash(JSON.stringify(newDomain))) {
                impacted.add(key);
            }
        }

        // Removed Domains
        for (const key of oldDomains.keys()) {
            if (!newDomains.has(key)) {
                impacted.add(key);
            }
        }

        // 3. Check Infrastructure Modules
        if (HashUtil.calculateHash(JSON.stringify(oldSpec.modules || [])) !== HashUtil.calculateHash(JSON.stringify(newSpec.modules || []))) {
            impacted.add('infrastructure');
        }

        return {
            impactedCapsuleIds: Array.from(impacted),
            isFullRegeneration: impacted.has('platform'),
            reason: impacted.size > 0 ? `Detected changes in ${impacted.size} capsules.` : "No changes detected."
        };
    }
}
