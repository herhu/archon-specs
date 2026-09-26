import { RegionManager } from '../src/core/region-manager';
import { SpecMutator, DesignSpec, Domain } from '../src/index';

async function testRegionChaos() {
    console.log('🔥 Starting RegionManager Chaos Test...');

    // Scenario 1: Duplicate IDs in old content
    console.log('\nScenario 1: Duplicate IDs (Expected to throw)');
    const oldWithDupes = `
        // @archon-manual-start:dupe
        Content A
        // @archon-manual-end
        // @archon-manual-start:dupe
        Content B
        // @archon-manual-end
    `;
    const newTarget = `
        // @archon-manual-start:dupe
        // @archon-manual-end
    `;
    try {
        RegionManager.merge(oldWithDupes, newTarget);
        console.error('❌ FAILED: Did not throw on duplicate IDs');
    } catch (e) {
        console.log('✅ PASSED:', e.message);
    }

    // Scenario 2: Mismatched Markers
    console.log('\nScenario 2: Mismatched Markers (Expected to throw)');
    const oldMismatched = `
        // @archon-manual-start:mismatch
        Incomplete content...
    `;
    try {
        RegionManager.merge(oldMismatched, newTarget);
        console.error('❌ FAILED: Did not throw on mismatch');
    } catch (e) {
        console.log('✅ PASSED:', e.message);
    }

    // Scenario 3: Nested markers
    console.log('\nScenario 3: Nested markers (Expected to throw)');
    const oldNested = `
        // @archon-manual-start:outer
        // @archon-manual-start:inner
        // @archon-manual-end
        // @archon-manual-end
    `;
    try {
        RegionManager.merge(oldNested, newTarget);
        console.error('❌ FAILED: Did not throw on nested');
    } catch (e) {
        console.log('✅ PASSED:', e.message);
    }
}

async function testSpecChaos() {
    console.log('\n🔥 Starting SpecMutator Chaos Test...');

    const spec: DesignSpec = {
        version: '1.0',
        name: 'Chaos App',
        domains: [{ name: 'Existing', key: 'existing', entities: [], services: [] }]
    };

    console.log('Scenario 4: Domain Merge (Update name)');
    const dupeDomain: Domain = { name: 'Brand New Name', key: 'existing', entities: [], services: [] };
    const mutated = SpecMutator.addDomain(spec, dupeDomain);
    if (mutated.domains[0].name === 'Brand New Name') {
        console.log('✅ PASSED: Domain name updated.');
    } else {
        console.error('❌ FAILED: Domain name not updated.');
    }
}

async function run() {
    await testRegionChaos();
    await testSpecChaos();
}

run();
