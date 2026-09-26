/**
 * Archon Scaling Benchmark Runner
 *
 * Produces structured benchmark data covering:
 *   B5 — Drift Detection Scaling: scan time vs managed artifact count (100 / 1K / 10K)
 *   B6 — Worker Pool Queue Throughput: simulated dispatch latency under concurrent load
 *        (Note: uses a queue-only simulation; no real MCP workers are spawned)
 *
 * Usage:
 *   npx ts-node scripts/benchmark-scaling.ts
 *   npx ts-node scripts/benchmark-scaling.ts --output ./benchmark-scaling-results.json
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { ArchonState, OwnershipEntry, ARCHON_ENGINE_VERSION, STATE_MANIFEST_VERSION } from '../src/core/state/state-manager';
import * as crypto from 'crypto';

// Lightweight hash helper (mirrors HashUtil.calculateHash without ts-morph dependency)
function sha256(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
}

// Minimal drift scan (mirrors DriftDetector.detect core logic without telemetry side effects)
function detectDrift(
    ownedArtifacts: Record<string, OwnershipEntry>,
    observedFiles: Record<string, { hash: string; maskedHash: string }>
): Array<{ path: string; type: string }> {
    const records: Array<{ path: string; type: string }> = [];
    for (const [filePath, entry] of Object.entries(ownedArtifacts)) {
        const obs = observedFiles[filePath];
        if (!obs) {
            records.push({ path: filePath, type: 'ArtifactMissing' });
        } else if (obs.hash !== entry.hash) {
            records.push({ path: filePath, type: 'ContentModified' });
        }
    }
    return records;
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const outputIdx = args.indexOf('--output');
const OUTPUT_PATH = outputIdx !== -1
    ? path.resolve(args[outputIdx + 1])
    : path.resolve(process.cwd(), 'benchmark-scaling-results.json');

// ---------------------------------------------------------------------------
// B5 — Drift Detection Scaling
// ---------------------------------------------------------------------------
interface DriftBenchmarkResult {
    artifact_count: number;
    drift_injected: number;
    duration_ms: number;
    artifacts_per_sec: number;
    drift_records_found: number;
}

function makeSyntheticState(artifactCount: number, driftFraction = 0.1): {
    ownedArtifacts: Record<string, OwnershipEntry>;
    observedFiles: Record<string, { hash: string; maskedHash: string }>;
    driftCount: number;
} {
    const ownedArtifacts: Record<string, OwnershipEntry> = {};
    const observedFiles: Record<string, { hash: string; maskedHash: string }> = {};
    const driftCount = Math.floor(artifactCount * driftFraction);

    for (let i = 0; i < artifactCount; i++) {
        const filePath = `src/generated/module-${Math.floor(i / 10)}/entity-${i}.ts`;
        const content = `// Entity ${i}\nexport class Entity${i} {}\n`;
        const hash = sha256(content);

        ownedArtifacts[filePath] = {
            path: filePath,
            hash,
            capsuleId: `capsule-${Math.floor(i / 10)}`,
            ownership: 'managed'
        };

        // Inject drift for the first `driftCount` files
        const observedContent = i < driftCount
            ? `// Entity ${i} MODIFIED\nexport class Entity${i} { extra = true; }\n`
            : content;
        const observedHash = sha256(observedContent);

        observedFiles[filePath] = {
            hash: observedHash,
            maskedHash: observedHash
        };
    }

    return { ownedArtifacts, observedFiles, driftCount };
}

async function benchmarkDriftDetection(): Promise<DriftBenchmarkResult[]> {
    console.log('\n[B5] Drift Detection Scaling...');
    const ARTIFACT_COUNTS = [100, 1_000, 10_000];
    const results: DriftBenchmarkResult[] = [];

    for (const count of ARTIFACT_COUNTS) {
        const { ownedArtifacts, observedFiles, driftCount } = makeSyntheticState(count);

        const t0 = Date.now();
        const records = detectDrift(ownedArtifacts, observedFiles);
        const duration_ms = Date.now() - t0;

        const artifacts_per_sec = duration_ms > 0 ? Math.round((count / duration_ms) * 1000) : Infinity;

        console.log(`  [${String(count).padStart(6)} artifacts] drift=${driftCount} found=${records.length} duration=${duration_ms}ms artifacts/sec=${artifacts_per_sec}`);
        results.push({
            artifact_count: count,
            drift_injected: driftCount,
            duration_ms,
            artifacts_per_sec,
            drift_records_found: records.length
        });
    }

    return results;
}

// ---------------------------------------------------------------------------
// B6 — Worker Pool Queue Simulation
// ---------------------------------------------------------------------------
interface PoolBenchmarkResult {
    concurrency: number;
    total_jobs: number;
    total_duration_ms: number;
    avg_queue_wait_ms: number;
    p95_queue_wait_ms: number;
    throughput_jobs_per_sec: number;
}

/**
 * Pure queue simulation: measures overhead of the dispatch loop itself,
 * without spawning real MCP workers. Each "job" is a zero-duration microtask.
 */
async function benchmarkWorkerPoolQueue(): Promise<PoolBenchmarkResult[]> {
    console.log('\n[B6] Worker Pool Queue Throughput (queue simulation)...');

    const CONCURRENCY_LEVELS = [1, 5, 10, 20];
    const JOBS_PER_RUN = 200;
    const results: PoolBenchmarkResult[] = [];

    for (const concurrency of CONCURRENCY_LEVELS) {
        const waitTimes: number[] = [];
        const poolStart = Date.now();

        // Simulate a bounded pool with `concurrency` workers
        let activeWorkers = 0;
        let jobsCompleted = 0;
        const queue: (() => Promise<void>)[] = [];

        function pump() {
            while (activeWorkers < concurrency && queue.length > 0) {
                const job = queue.shift()!;
                activeWorkers++;
                job().finally(() => {
                    activeWorkers--;
                    jobsCompleted++;
                    pump();
                });
            }
        }

        const promises: Promise<void>[] = [];
        for (let i = 0; i < JOBS_PER_RUN; i++) {
            const enqueueTime = Date.now();
            const p = new Promise<void>((resolve) => {
                queue.push(async () => {
                    waitTimes.push(Date.now() - enqueueTime);
                    // Simulate a minimal async tool dispatch (a single tick)
                    await Promise.resolve();
                    resolve();
                });
            });
            promises.push(p);
        }

        pump();
        await Promise.all(promises);

        const total_duration_ms = Date.now() - poolStart;
        const sorted = [...waitTimes].sort((a, b) => a - b);
        const avg_queue_wait_ms = sorted.reduce((s, v) => s + v, 0) / sorted.length;
        const p95_queue_wait_ms = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1] ?? 0;
        const throughput_jobs_per_sec = total_duration_ms > 0
            ? Math.round((JOBS_PER_RUN / total_duration_ms) * 1000)
            : Infinity;

        console.log(`  [concurrency=${String(concurrency).padStart(2)}] jobs=${JOBS_PER_RUN} total=${total_duration_ms}ms avgWait=${avg_queue_wait_ms.toFixed(2)}ms p95Wait=${p95_queue_wait_ms}ms throughput=${throughput_jobs_per_sec} jobs/sec`);

        results.push({
            concurrency,
            total_jobs: JOBS_PER_RUN,
            total_duration_ms,
            avg_queue_wait_ms: parseFloat(avg_queue_wait_ms.toFixed(2)),
            p95_queue_wait_ms,
            throughput_jobs_per_sec
        });
    }

    return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    console.log('╔══════════════════════════════════════╗');
    console.log('║   Archon Scaling Benchmark Runner    ║');
    console.log('╚══════════════════════════════════════╝');
    console.log(`Output: ${OUTPUT_PATH}\n`);

    const [driftDetection, workerPool] = await Promise.all([
        benchmarkDriftDetection(),
        benchmarkWorkerPoolQueue()
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
        driftDetection,
        workerPool
    };

    await fs.outputJson(OUTPUT_PATH, report, { spaces: 2 });

    console.log('\n══════════════════════════════════════');
    console.log('Summary');
    console.log('══════════════════════════════════════');
    console.log('Drift Detection Scaling:');
    for (const r of driftDetection) {
        const label = String(r.artifact_count).padStart(6);
        console.log(`  ${label} artifacts   ${String(r.duration_ms).padStart(6)}ms   ${String(r.artifacts_per_sec).padStart(8)} artifacts/sec`);
    }
    console.log('\nWorker Pool Throughput:');
    for (const r of workerPool) {
        console.log(`  concurrency=${String(r.concurrency).padStart(2)}   ${String(r.throughput_jobs_per_sec).padStart(7)} jobs/sec   p95 wait=${r.p95_queue_wait_ms}ms`);
    }
    console.log(`\n✓ Report written to: ${OUTPUT_PATH}`);
}

main().catch(err => {
    console.error('[benchmark-scaling] FATAL:', err);
    process.exit(1);
});
