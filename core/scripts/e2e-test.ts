import * as path from 'path';
import * as fs from 'fs-extra';
import { generateApp, SpecMutator, DesignSpec, Domain } from '../src/index';

const E2E_DIR = path.resolve(process.cwd(), 'e2e-lab');

async function runE2E() {
    console.log('🚀 Starting E2E Spec Evolution Test...');

    // 1. Setup E2E Dir (Reset for clean test)
    if (fs.existsSync(E2E_DIR)) {
        await fs.remove(E2E_DIR);
    }
    await fs.ensureDir(E2E_DIR);

    // 2. Initial Spec
    const initialSpec: DesignSpec = {
        version: '1.0',
        name: 'E2E Test App',
        domains: [
            {
                name: 'User Management',
                key: 'user-management',
                entities: [
                    {
                        name: 'User',
                        fields: [
                            { name: 'id', type: 'uuid', primary: true },
                            { name: 'username', type: 'string' }
                        ]
                    }
                ],
                services: [
                    {
                        name: 'UserService',
                        route: 'users',
                        entity: 'User',
                        crud: ['create', 'findAll']
                    }
                ]
            }
        ]
    };

    // 3. Initial Generation
    console.log('--- Phase 1: Initial Generation ---');
    await generateApp(initialSpec, E2E_DIR);
    console.log('✅ Initial generation complete.');

    // 4. Human Intervention (Add manual code)
    console.log('--- Phase 2: Human Intervention ---');
    const userEntityPath = path.join(E2E_DIR, 'src/modules/user-management/entities/user.entity.ts');
    let content = await fs.readFile(userEntityPath, 'utf-8');
    
    const manualImport = "// @archon-manual-start:imports\nimport { MyCustomType } from './custom-types';\n// @archon-manual-end";
    const manualMethods = "// @archon-manual-start:methods\n  @Column()\n  customData: string;\n// @archon-manual-end";

    content = content.replace(/\/\/\s*@archon-manual-start:imports[\s\S]*?\/\/\s*@archon-manual-end/, manualImport);
    content = content.replace(/\/\/\s*@archon-manual-start:methods[\s\S]*?\/\/\s*@archon-manual-end/, manualMethods);

    await fs.writeFile(userEntityPath, content);
    console.log('✅ Manual changes added to User entity.');

    // 5. Spec Mutation (Remote Authority Simulation)
    console.log('--- Phase 3: Spec Mutation ---');
    const newDomain: Domain = {
        name: 'Finance',
        key: 'finance',
        entities: [
            {
                name: 'Transaction',
                fields: [
                    { name: 'id', type: 'uuid', primary: true },
                    { name: 'amount', type: 'float' }
                ]
            }
        ],
        services: [
            {
                name: 'TransactionService',
                route: 'transactions',
                entity: 'Transaction',
                crud: ['create', 'findAll']
            }
        ]
    };

    const mutatedSpec = SpecMutator.addDomain(initialSpec, newDomain);
    console.log('✅ Spec mutated with Finance domain.');

    // 6. Regeneration (Sync Simulation)
    console.log('--- Phase 4: Regeneration (Sync) ---');
    await generateApp(mutatedSpec, E2E_DIR);
    console.log('✅ Regeneration complete.');

    // 7. Verification
    console.log('--- Phase 5: Verification ---');
    
    const transactionServicePath = path.join(E2E_DIR, 'src/modules/finance/services/transaction.service.ts');
    if (fs.existsSync(transactionServicePath)) {
        console.log('✅ SUCCESS: New domain (Finance) files generated.');
    } else {
        console.error('❌ FAILURE: Finance domain files missing!');
    }

    const updatedContent = await fs.readFile(userEntityPath, 'utf-8');
    const hasManualImport = updatedContent.includes("import { MyCustomType } from './custom-types';");
    const hasManualBody = updatedContent.includes("customData: string;");

    if (hasManualImport && hasManualBody) {
        console.log('✅ SUCCESS: Manual code regions preserved in User entity.');
    } else {
        console.error('❌ FAILURE: Manual code regions LOST!');
    }

    console.log('🚀 E2E Test Finished. Lab remaining at:', E2E_DIR);
}

runE2E().catch(err => {
    console.error('❌ E2E Test Crashed:', err);
    process.exit(1);
});
