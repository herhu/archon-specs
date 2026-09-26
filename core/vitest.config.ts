import { defineConfig } from 'vitest/config';
import * as path from 'path';

/**
 * Vitest configuration for archon-core.
 *
 * The test files were written against an older flat module layout
 * (e.g. `../src/core/governance.js`) before the source was reorganised into
 * sub-directories.  The `resolve.alias` table below maps every legacy flat
 * path to its current nested location so the tests can run without modifying
 * the test files themselves.
 *
 * It also strips `.js` extensions from relative imports so that Vitest/Vite
 * resolves them as TypeScript source files.
 */
export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        alias: {
            // Legacy flat-path → current nested-path aliases
            // (used by test files written before the src reorganisation)
            '../src/core/governance.js':        path.resolve(__dirname, 'src/core/governance/governance.ts'),
            '../../src/core/governance.js':     path.resolve(__dirname, 'src/core/governance/governance.ts'),
            '../src/core/telemetry.js':         path.resolve(__dirname, 'src/core/telemetry/telemetry.ts'),
            '../../src/core/telemetry.js':      path.resolve(__dirname, 'src/core/telemetry/telemetry.ts'),
            '../src/core/normalize.js':         path.resolve(__dirname, 'src/core/state/normalize.ts'),
            '../../src/core/normalize.js':      path.resolve(__dirname, 'src/core/state/normalize.ts'),
            '../src/core/validator.js':         path.resolve(__dirname, 'src/core/validators/validator.ts'),
            '../../src/core/validator.js':      path.resolve(__dirname, 'src/core/validators/validator.ts'),
            '../src/core/hash-util.js':         path.resolve(__dirname, 'src/core/utils/hash-util.ts'),
            '../../src/core/hash-util.js':      path.resolve(__dirname, 'src/core/utils/hash-util.ts'),
            '../src/core/spec.js':              path.resolve(__dirname, 'src/core/state/spec.ts'),
            '../../src/core/spec.js':           path.resolve(__dirname, 'src/core/state/spec.ts'),
            '../../src/core/change-planner.js': path.resolve(__dirname, 'src/core/engine/change-planner.ts'),
            '../../src/core/region-manager.js': path.resolve(__dirname, 'src/core/registry/region-manager.ts'),
            '../../src/core/logger.js':         path.resolve(__dirname, 'src/core/telemetry/logger.ts'),
            '../../src/core/template-engine.js':path.resolve(__dirname, 'src/core/vfs/template-engine.ts'),
        }
    },
    resolve: {
        // Allow Vite to import .ts files when a .js extension is specified
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json']
    }
});
