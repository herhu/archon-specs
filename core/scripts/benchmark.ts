/**
 * Archon Master Benchmark Runner
 *
 * Produces structured benchmark data covering:
 *   B1 — Spec Compilation Latency (small / medium / enterprise scale)
 *   B3 — System Health from Telemetry (successRate, avgDurationMs, verificationRate)
 *   B4 — Stream Materialization Throughput (ops/sec at 10 / 50 / 200 operations)
 *   B7 — Generated Code Quality (tsc + eslint pass rates)
 *
 * Usage:
 *   npx ts-node scripts/benchmark.ts
 *   npx ts-node scripts/benchmark.ts --output ./benchmark-results.json
 *
 * Outputs benchmark-results.json in the archon project root (or --output path).
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { normalizeSpec } from '../src/core/state/normalize';
import { DesignSpec } from '../src/core/state/spec';
import { CrossTraceAnalyzer } from '../src/observability/intelligence-engine';
import { TraceModel } from '../src/observability/models';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const outputIdx = args.indexOf('--output');
const OUTPUT_PATH = outputIdx !== -1
    ? path.resolve(args[outputIdx + 1])
    : path.resolve(process.cwd(), 'benchmark-results.json');

// ---------------------------------------------------------------------------
// Spec factories (synthetic fixtures at different scales)
// ---------------------------------------------------------------------------

function makeField(idx: number) {
    return { name: `field_${idx}`, type: idx === 0 ? 'uuid' : 'string', primary: idx === 0 };
}

function makeEntity(name: string, fieldCount = 5) {
    return {
        name,
        fields: Array.from({ length: fieldCount }, (_, i) => makeField(i))
    };
}

function makeDomain(name: string, entityCount: number): DesignSpec['domains'][number] {
    return {
        name,
        key: name.toLowerCase().replace(/\s+/g, '-'),
        entities: Array.from({ length: entityCount }, (_, i) => makeEntity(`${name}Entity${i}`))
    };
}

function makeSpec(label: string, domainCount: number, entitiesPerDomain: number): DesignSpec {
    return {
        version: '2.6',
        name: `Benchmark ${label}`,
        domains: Array.from({ length: domainCount }, (_, i) => makeDomain(`Domain${i}`, entitiesPerDomain))
    };
}

// Small  : 1 domain,  5 entities  → ~5 entities total
// Medium : 5 domains, 10 entities → ~50 entities total
// Large  : 10 domains, 20 entities → ~200 entities total
const SPEC_TIERS = [
    { label: 'small',      spec: makeSpec('Small',      1,  5)  },
    { label: 'medium',     spec: makeSpec('Medium',     5,  10) },
    { label: 'enterprise', spec: makeSpec('Enterprise', 10, 20) }
];

// ---------------------------------------------------------------------------
// B1 — Spec Compilation Latency
// ---------------------------------------------------------------------------
interface CompilationResult {
    tier: string;
    entity_count: number;
    runs: number;
    avg_ms: number;
    min_ms: number;
    max_ms: number;
    entities_per_sec: number;
}

async function benchmarkSpecCompilation(): Promise<CompilationResult[]> {
    console.log('\n[B1] Spec Compilation Latency...');
    const RUNS = 10;
    const results: CompilationResult[] = [];

    // Warmup: one cold run per tier discarded before measuring
    for (const { spec } of SPEC_TIERS) normalizeSpec(spec);

    for (const { label, spec } of SPEC_TIERS) {
        const entityCount = spec.domains.reduce((sum, d) => sum + (d.entities?.length ?? 0), 0);
        const durations: number[] = [];

        for (let r = 0; r < RUNS; r++) {
            const t0 = performance.now();
            normalizeSpec(spec);
            durations.push(performance.now() - t0);
        }

        const avg_ms = durations.reduce((s, v) => s + v, 0) / durations.length;
        const min_ms = Math.min(...durations);
        const max_ms = Math.max(...durations);
        const entities_per_sec = avg_ms > 0 ? Math.round((entityCount / avg_ms) * 1000) : Infinity;

        console.log(`  [${label}] entities=${entityCount} avg=${avg_ms.toFixed(1)}ms min=${min_ms}ms max=${max_ms}ms eps=${entities_per_sec}`);
        results.push({ tier: label, entity_count: entityCount, runs: RUNS, avg_ms, min_ms, max_ms, entities_per_sec });
    }

    return results;
}

// ---------------------------------------------------------------------------
// B3 — System Health from Telemetry
// ---------------------------------------------------------------------------
interface SystemHealthResult {
    traces_analyzed: number;
    success_rate_pct: number;
    avg_duration_ms: number;
    verification_rate_pct: number;
    high_failure_tools: string[];
    source: 'telemetry' | 'unavailable';
}

async function benchmarkSystemHealth(): Promise<SystemHealthResult> {
    console.log('\n[B3] System Health from Telemetry...');

    // Scan for telemetry JSONL files in .archon project directories
    const archonBase = path.resolve(process.cwd(), '..', '.archon', 'projects');
    const traces: TraceModel[] = [];

    if (await fs.pathExists(archonBase)) {
        const projectDirs = await fs.readdir(archonBase);
        for (const proj of projectDirs) {
            const telemetryFile = path.join(archonBase, proj, 'telemetry.jsonl');
            if (await fs.pathExists(telemetryFile)) {
                const content = await fs.readFile(telemetryFile, 'utf8');
                const lines = content.split('\n').filter(l => l.trim());
                for (const line of lines) {
                    try {
                        const event = JSON.parse(line);
                        // Collect root-level trace events only
                        if (event.traceId && event.spans) {
                            traces.push(event as TraceModel);
                        }
                    } catch { /* skip malformed lines */ }
                }
            }
        }
    }

    if (traces.length === 0) {
        console.log('  No telemetry data found — reporting defaults.');
        return {
            traces_analyzed: 0,
            success_rate_pct: 0,
            avg_duration_ms: 0,
            verification_rate_pct: 0,
            high_failure_tools: [],
            source: 'unavailable'
        };
    }

    const intelligence = CrossTraceAnalyzer.analyze(traces);
    const highFailureTools = intelligence.recurringIssues
        .filter(i => i.type === 'failure' && i.severity === 'high')
        .map(i => i.target);

    console.log(`  traces=${traces.length} success=${intelligence.systemHealth.successRate.toFixed(1)}% avgDuration=${intelligence.systemHealth.avgDurationMs.toFixed(0)}ms verification=${intelligence.systemHealth.verificationRate.toFixed(1)}%`);

    return {
        traces_analyzed: traces.length,
        success_rate_pct: parseFloat(intelligence.systemHealth.successRate.toFixed(2)),
        avg_duration_ms: parseFloat(intelligence.systemHealth.avgDurationMs.toFixed(2)),
        verification_rate_pct: parseFloat(intelligence.systemHealth.verificationRate.toFixed(2)),
        high_failure_tools: highFailureTools,
        source: 'telemetry'
    };
}

// ---------------------------------------------------------------------------
// B4 — Stream Materialization Throughput
// ---------------------------------------------------------------------------
interface MaterializationResult {
    op_count: number;
    duration_ms: number;
    ops_per_sec: number;
}

async function benchmarkMaterialization(): Promise<MaterializationResult[]> {
    console.log('\n[B4] Stream Materialization Throughput...');

    const OP_COUNTS = [10, 50, 200];
    const RUNS = 3;
    const results: MaterializationResult[] = [];
    const tmpBase = path.join(os.tmpdir(), `archon-bench-mat-${Date.now()}`);

    // Warmup: pre-create the directory and write one file to warm the fs path
    await fs.ensureDir(tmpBase);
    await fs.outputFile(path.join(tmpBase, 'warmup.ts'), '// warmup\n');

    for (const opCount of OP_COUNTS) {
        const runDurations: number[] = [];

        for (let r = 0; r < RUNS; r++) {
            const runDir = path.join(tmpBase, `run-${r}-${opCount}`);
            await fs.ensureDir(runDir);
            const files = Array.from({ length: opCount }, (_, i) => ({
                p: path.join(runDir, `bench-${i}.ts`),
                content: `// Generated file ${i}\nexport const value = ${i};\n`
            }));

            const t0 = performance.now();
            for (const { p, content } of files) {
                await fs.outputFile(p, content);
            }
            runDurations.push(performance.now() - t0);
            await fs.remove(runDir);
        }

        // Use median across runs to avoid outliers
        runDurations.sort((a, b) => a - b);
        const duration_ms = parseFloat(runDurations[Math.floor(runDurations.length / 2)].toFixed(2));
        const ops_per_sec = duration_ms > 0 ? Math.round((opCount / duration_ms) * 1000) : Infinity;

        console.log(`  [${opCount} ops] median=${duration_ms}ms ops/sec=${ops_per_sec}`);
        results.push({ op_count: opCount, duration_ms, ops_per_sec });
    }

    await fs.remove(tmpBase);
    return results;
}

// ---------------------------------------------------------------------------
// B7 — Generated Code Quality (tsc + eslint on generated output)
// ---------------------------------------------------------------------------
interface CodeQualityResult {
    ran: boolean;
    skipped_reason?: string;
    files_inspected: number;
    tsc_errors: number;
    tsc_pass_pct: number;
    eslint_errors: number;
    eslint_pass_pct: number;
}

async function benchmarkCodeQuality(): Promise<CodeQualityResult> {
    console.log('\n[B7] Generated Code Quality...');

    // Look for the most recent generated output in common lab directories
    const candidates = [
        path.resolve(process.cwd(), 'x-social-persistent-lab'),
        path.resolve(process.cwd(), 'e2e-lab'),
        path.resolve(process.cwd(), '..', 'scratch')
    ];

    let targetDir: string | null = null;
    for (const c of candidates) {
        if (await fs.pathExists(c)) {
            try {
                // Require at least 5 TS files to be a meaningful generated output
                const tsFiles = execSync(`find "${c}" -name "*.ts" -not -path "*/node_modules/*" -not -name "*.d.ts"`, { encoding: 'utf8' });
                const count = tsFiles.trim().split('\n').filter(Boolean).length;
                if (count >= 5) { targetDir = c; break; }
            } catch { /* ignore */ }
        }
    }

    if (!targetDir) {
        console.log('  No generated code directory found — skipping. Run pipeline-test.ts first.');
        return {
            ran: false,
            skipped_reason: 'No generated output directory found. Run: npx ts-node scripts/pipeline-test.ts',
            files_inspected: 0,
            tsc_errors: 0,
            tsc_pass_pct: 0,
            eslint_errors: 0,
            eslint_pass_pct: 0
        };
    }

    // Count TypeScript source files
    let tsFileList: string[] = [];
    try {
        const raw = execSync(`find "${targetDir}" -name "*.ts" -not -path "*/node_modules/*" -not -name "*.d.ts"`, { encoding: 'utf8' });
        tsFileList = raw.trim().split('\n').filter(Boolean);
    } catch { /* ignore */ }

    const filesInspected = tsFileList.length;
    if (filesInspected === 0) {
        return {
            ran: false,
            skipped_reason: 'No .ts files found in generated output',
            files_inspected: 0,
            tsc_errors: 0,
            tsc_pass_pct: 0,
            eslint_errors: 0,
            eslint_pass_pct: 0
        };
    }

    // tsc check: count error lines
    let tscErrors = 0;
    try {
        execSync(`npx tsc --noEmit --allowJs --checkJs false --skipLibCheck --target ES2021 --moduleResolution node --esModuleInterop --strict false ${tsFileList.slice(0, 50).join(' ')} 2>&1`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: targetDir
        });
    } catch (err: any) {
        const output: string = err.stdout || '';
        tscErrors = (output.match(/error TS\d+/g) || []).length;
    }

    // eslint check: count error-level findings (best effort, may not have config)
    let eslintErrors = 0;
    try {
        const eslintOut = execSync(
            `npx eslint --no-eslintrc --rule '{"no-undef": "error", "no-unused-vars": "warn"}' --ext .ts ${tsFileList.slice(0, 30).join(' ')} 2>&1 || true`,
            { encoding: 'utf8', cwd: targetDir }
        );
        eslintErrors = (eslintOut.match(/\d+ error/g) || []).reduce((s, m) => s + parseInt(m), 0);
    } catch { /* eslint not available — skip */ }

    const tscPassPct = filesInspected > 0
        ? parseFloat(Math.max(0, ((filesInspected - tscErrors) / filesInspected) * 100).toFixed(1))
        : 0;
    const eslintPassPct = filesInspected > 0
        ? parseFloat(Math.max(0, ((filesInspected - eslintErrors) / filesInspected) * 100).toFixed(1))
        : 0;

    console.log(`  dir=${targetDir} files=${filesInspected} tsc_errors=${tscErrors} (${tscPassPct}% clean) eslint_errors=${eslintErrors} (${eslintPassPct}% clean)`);

    return {
        ran: true,
        files_inspected: filesInspected,
        tsc_errors: tscErrors,
        tsc_pass_pct: tscPassPct,
        eslint_errors: eslintErrors,
        eslint_pass_pct: eslintPassPct
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    console.log('╔══════════════════════════════════════╗');
    console.log('║    Archon Master Benchmark Runner    ║');
    console.log('╚══════════════════════════════════════╝');
    console.log(`Output: ${OUTPUT_PATH}\n`);

    const [specCompilation, systemHealth, materialization, codeQuality] = await Promise.all([
        benchmarkSpecCompilation(),
        benchmarkSystemHealth(),
        benchmarkMaterialization(),
        benchmarkCodeQuality()
    ]);

    const report = {
        timestamp: new Date().toISOString(),
        archon_version: '2.6',
        host: {
            platform: os.platform(),
            cpus: os.cpus().length,
            memory_gb: parseFloat((os.totalmem() / 1e9).toFixed(1)),
            node_version: process.version
        },
        specCompilation,
        systemHealth,
        materialization,
        codeQuality
    };

    await fs.outputJson(OUTPUT_PATH, report, { spaces: 2 });

    console.log('\n══════════════════════════════════════');
    console.log('Summary');
    console.log('══════════════════════════════════════');
    console.log(`Spec Compilation:`);
    for (const r of specCompilation) {
        console.log(`  ${r.tier.padEnd(12)} ${r.avg_ms.toFixed(1).padStart(7)}ms avg   ${String(r.entities_per_sec).padStart(6)} entities/sec`);
    }
    console.log(`\nSystem Health (from ${systemHealth.traces_analyzed} traces):`);
    if (systemHealth.source === 'telemetry') {
        console.log(`  Success Rate     : ${systemHealth.success_rate_pct}%`);
        console.log(`  Avg Duration     : ${systemHealth.avg_duration_ms}ms`);
        console.log(`  Verification Rate: ${systemHealth.verification_rate_pct}%`);
    } else {
        console.log(`  No telemetry data available yet`);
    }
    console.log(`\nMaterialization Throughput:`);
    for (const r of materialization) {
        console.log(`  ${String(r.op_count).padStart(3)} ops   ${String(r.duration_ms).padStart(5)}ms   ${String(r.ops_per_sec).padStart(6)} ops/sec`);
    }
    if (codeQuality.ran) {
        console.log(`\nCode Quality (${codeQuality.files_inspected} files):`);
        console.log(`  TSC clean  : ${codeQuality.tsc_pass_pct}%`);
        console.log(`  ESLint clean: ${codeQuality.eslint_pass_pct}%`);
    } else {
        console.log(`\nCode Quality: ${codeQuality.skipped_reason}`);
    }
    console.log(`\n✓ Report written to: ${OUTPUT_PATH}`);
}

main().catch(err => {
    console.error('[benchmark] FATAL:', err);
    process.exit(1);
});
