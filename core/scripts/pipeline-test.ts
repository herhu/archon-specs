import * as path from 'path';
import * as fs from 'fs-extra';
import { execSync } from 'child_process';
import { generateApp, SpecMutator, DesignSpec, verifyLineage } from '../src/index';

const SPEC_PATH = path.resolve(process.cwd(), '../x-spec.json');
const OUT_DIR = path.resolve(process.cwd(), 'x-social-persistent-lab');

async function runPipeline() {
    console.log('🏁 Starting Persistent Pipeline Stress Test (x-spec.json)...');

    // Reset OUT_DIR for a clean starting point
    if (fs.existsSync(OUT_DIR)) {
        console.log('🧹 Preparing fresh lab environment...');
        await fs.remove(OUT_DIR);
    }

    // 1. Initial Generation
    console.log('\n--- Phase 1: Initial Generation ---');
    const initialSpec = await fs.readJSON(SPEC_PATH) as DesignSpec;
    await generateApp(initialSpec, OUT_DIR);
    console.log('✅ Base social network generated.');

    // 2. Run ARCHON.sh (Onboarding Simulation)
    console.log('\n--- Phase 2: Running ARCHON.sh ---');
    try {
        execSync('sh ARCHON.sh', { cwd: OUT_DIR, stdio: 'inherit' });
    } catch (e) {
        console.warn('⚠️ ARCHON.sh finished with environment warnings (Normal).');
    }

    // 3. Manual Intervention (Social/User Entity)
    console.log('\n--- Phase 3: Manual Modification ---');
    const userEntityPath = path.join(OUT_DIR, 'src/modules/social/entities/user.entity.ts');
    let content = await fs.readFile(userEntityPath, 'utf-8');
    
    const manualImport = "// @archon-manual-start:imports\nimport { SubscriptionStatus } from './enums';\n// @archon-manual-end";
    const manualMethods = "// @archon-manual-start:methods\n  @Column()\n  isPremium: boolean = false;\n\n  public getFullHandle(): string {\n    return `@${this.handle}`;\n  }\n// @archon-manual-end";

    content = content.replace(/\/\/\s*@archon-manual-start:imports[\s\S]*?\/\/\s*@archon-manual-end/, manualImport);
    content = content.replace(/\/\/\s*@archon-manual-start:methods[\s\S]*?\/\/\s*@archon-manual-end/, manualMethods);

    await fs.writeFile(userEntityPath, content);
    console.log('✅ Manual logic injected (Premium Handle feature).');

    // 4. Lineage Audit
    console.log('\n--- Phase 4: Lineage Audit ---');
    const templatesDir = path.join(process.cwd(), "src/templates");
    const audit = await verifyLineage(initialSpec, OUT_DIR, templatesDir);
    if (audit.valid) {
        console.log('✅ Lineage Valid: Code matches Spec.');
    } else {
        console.error('❌ Lineage Audit Failed!');
    }

    // 5. Spec Mutation (Add Billing Domain)
    console.log('\n--- Phase 5: Spec Mutation (Add Billing) ---');
    const billingDomain = {
        name: 'Billing System',
        key: 'billing',
        entities: [
            {
                name: 'Subscription',
                fields: [
                    { name: 'id', type: 'uuid', primary: true },
                    { name: 'plan', type: 'string' },
                    { name: 'active', type: 'boolean' }
                ]
            }
        ],
        services: [
            {
                name: 'SubscriptionsService',
                route: '/subscriptions',
                entity: 'Subscription',
                crud: ['create', 'findAll', 'findOne', 'delete']
            }
        ]
    };

    const mutatedSpec = SpecMutator.addDomain(initialSpec, billingDomain as any);
    console.log('✅ Spec mutated: Added Billing system.');

    // 6. Final Sync (Regeneration)
    console.log('\n--- Phase 6: Final Sync (Regeneration) ---');
    await generateApp(mutatedSpec, OUT_DIR);
    console.log('✅ System evolved from spec.');

    // 7. Final Verification
    console.log('\n--- Phase 7: Final Integrity Check ---');
    
    const billingModulePath = path.join(OUT_DIR, 'src/modules/billing/billing.module.ts');
    const updatedContent = await fs.readFile(userEntityPath, 'utf-8');
    const hasMethods = updatedContent.includes("public getFullHandle(): string");

    if (fs.existsSync(billingModulePath) && hasMethods) {
        console.log('✅ FULL SUCCESS: Billing domain added AND manual logic preserved.');
    } else {
        console.error('❌ FAILURE: Spec sync vs Manual logic collision.');
    }

    console.log('\n🏁 Pipeline Finished. Lab state preserved at:', OUT_DIR);
}

runPipeline().catch(err => {
    console.error('💥 Integration Test Crashed:', err);
    process.exit(1);
});
