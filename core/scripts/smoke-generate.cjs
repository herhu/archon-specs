/**
 * Smoke gate: generate representative projects from fixture specs, then compile
 * each with the REAL toolchain (npm install + tsc --noEmit + eslint).
 *
 * Runs against the BUILT dist (what actually ships). Catches the class of bugs
 * that intra-project validation misses — errors that only surface against real
 * @nestjs/typeorm/class-validator types (wrong inverse-relationship property,
 * missing `@Put` import, DTO/entity overload mismatches, …).
 *
 * Two fixtures:
 *   - smoke-spec.json            : lean CRUD app
 *   - smoke-spec-enterprise.json : auth + Redis + BullMQ + db-transactions + FKs
 *
 * Usage:  npm run smoke   (runs `npm run build` first)
 * Exit 0 = all generated projects type-check + lint; non-zero = regression.
 */
const path = require("path");
const os = require("os");
const fs = require("fs-extra");
const { execSync } = require("child_process");

const { executeOrchestrator } = require("../dist/src/core/engine/orchestrator-api.js");
const { normalizeSpec } = require("../dist/src/core/state/normalize.js");

const FIXTURES = ["smoke-spec.json", "smoke-spec-enterprise.json"];

async function runFixture(fixture) {
  const specPath = path.join(__dirname, "..", "tests", "fixtures", fixture);
  const spec = normalizeSpec(fs.readJsonSync(specPath));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "archon-smoke-"));

  console.log(`\n[smoke] === ${fixture} -> "${spec.name}" === ${outDir}`);
  const result = await executeOrchestrator(spec, outDir, "apply", undefined, true, "smoke");

  const errors = result.validationErrors || [];
  if (errors.length > 0) {
    console.error(`[smoke] FAIL internal validation (${errors.length}):`);
    errors.slice(0, 20).forEach((e) => console.error("   - " + e));
    process.exit(1);
  }
  console.log(`[smoke] internal validation clean.`);

  // Architecture-layer wiring assertions: whatever the spec DECLARES
  // (crossCutting.auth / platform.throttling / modules) MUST be wired into the
  // generated app. Guards the silent-drop class of bugs (auth/throttle/redis/bullmq
  // declared but never connected) at the engine level.
  const appModule = fs.readFileSync(path.join(outDir, "src/app.module.ts"), "utf-8");
  const wiringChecks = [];
  if (spec.crossCutting?.auth) {
    wiringChecks.push([appModule.includes("AuthModule"), "crossCutting.auth -> AuthModule wired"]);
    wiringChecks.push([fs.existsSync(path.join(outDir, "src/auth/jwt.guard.ts")), "crossCutting.auth -> jwt.guard generated"]);
  }
  if (spec.platform?.throttling) {
    wiringChecks.push([appModule.includes("ThrottlerModule"), "platform.throttling -> ThrottlerModule wired"]);
  }
  for (const m of spec.modules || []) {
    if (m.type === "cache.redis") wiringChecks.push([/redis|Cache/i.test(appModule), "modules cache.redis -> wired"]);
    if (m.type === "queue.bullmq") wiringChecks.push([/bull|Queue/i.test(appModule), "modules queue.bullmq -> wired"]);
  }
  const wiringFailed = wiringChecks.filter(([ok]) => !ok).map(([, m]) => m);
  if (wiringFailed.length) {
    console.error(`[smoke] FAIL "${fixture}" architecture wiring dropped: ${wiringFailed.join("; ")}. Dir kept: ${outDir}`);
    process.exit(1);
  }
  if (wiringChecks.length) console.log(`[smoke] architecture wiring OK (${wiringChecks.length} checks).`);

  // E2 — a versioned migration snapshot must be generated, synchronize must be OFF
  // by default (migrations are the runtime source of truth).
  const migDir = path.join(outDir, "scripts/migrations");
  const migFiles = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")) : [];
  if (migFiles.length < 1) {
    console.error(`[smoke] FAIL "${fixture}" no versioned migration generated under scripts/migrations. Dir kept: ${outDir}`);
    process.exit(1);
  }
  const migSql = fs.readFileSync(path.join(migDir, migFiles[0]), "utf-8");
  if (!/CREATE TABLE/i.test(migSql)) {
    console.error(`[smoke] FAIL "${fixture}" migration ${migFiles[0]} has no CREATE TABLE. Dir kept: ${outDir}`);
    process.exit(1);
  }
  if (/synchronize:\s*true/.test(appModule)) {
    console.error(`[smoke] FAIL "${fixture}" app.module has synchronize:true (must be env-gated/off). Dir kept: ${outDir}`);
    process.exit(1);
  }
  console.log(`[smoke] migrations OK (${migFiles[0]}, synchronize off).`);

  // E4 — when a fixture declares queue.bullmq + db-transactions, the transactional
  // outbox subsystem must be generated and wired.
  const hasQueue = (spec.modules || []).some((m) => m.type === "queue.bullmq");
  const hasTx = (spec.modules || []).some((m) => m.type === "db-transactions");
  if (hasQueue && hasTx) {
    const obChecks = [
      [fs.existsSync(path.join(outDir, "src/modules/core/outbox/outbox.module.ts")), "outbox module generated"],
      [fs.existsSync(path.join(outDir, "src/modules/core/outbox/outbox-relay.service.ts")), "outbox relay generated"],
      [fs.existsSync(path.join(outDir, "scripts/migrations/0000_outbox.sql")), "outbox migration generated"],
      [appModule.includes("OutboxModule"), "OutboxModule wired into app.module"],
      [appModule.includes("ScheduleModule.forRoot()"), "ScheduleModule wired into app.module"],
    ];
    const obFailed = obChecks.filter(([ok]) => !ok).map(([, m]) => m);
    if (obFailed.length) {
      console.error(`[smoke] FAIL "${fixture}" outbox not wired: ${obFailed.join("; ")}. Dir kept: ${outDir}`);
      process.exit(1);
    }
    console.log(`[smoke] outbox OK (${obChecks.length} checks).`);
  }

  try {
    console.log(`[smoke] npm install ...`);
    execSync("npm install --no-audit --no-fund --loglevel=error", { cwd: outDir, stdio: "inherit" });
    console.log(`[smoke] tsc --noEmit ...`);
    execSync("npx tsc --noEmit -p tsconfig.json", { cwd: outDir, stdio: "inherit" });
    console.log(`[smoke] lint (project's own eslint --fix, as ARCHON.sh runs) ...`);
    execSync("npm run lint", { cwd: outDir, stdio: "inherit" });
  } catch {
    console.error(`[smoke] FAIL "${fixture}" did not compile/lint (see output above). Dir kept: ${outDir}`);
    process.exit(1);
  }

  // E1 — generated tests must actually run AND pass. `--passWithNoTests` is gone,
  // so an empty suite fails; we also assert >=1 passing test so a silently-empty
  // generation can't go green.
  console.log(`[smoke] npm test (jest) ...`);
  let testOut = "";
  try {
    testOut = execSync("npm test -- --ci 2>&1", { cwd: outDir, encoding: "utf-8" });
    process.stdout.write(testOut);
  } catch (e) {
    process.stdout.write(String((e && e.stdout) || "") + String((e && e.stderr) || ""));
    console.error(`[smoke] FAIL "${fixture}" tests failed. Dir kept: ${outDir}`);
    process.exit(1);
  }
  const m = testOut.match(/Tests:\s+(?:\d+ failed, )?(\d+) passed/);
  const passed = m ? parseInt(m[1], 10) : 0;
  if (passed < 1) {
    console.error(`[smoke] FAIL "${fixture}" expected >=1 passing test, got ${passed}. Dir kept: ${outDir}`);
    process.exit(1);
  }
  console.log(`[smoke] tests OK (${passed} passing).`);

  console.log(`[smoke] PASS "${fixture}" — compiles + lints + tests with real dependencies.`);
  await fs.remove(outDir).catch(() => {});
}

async function main() {
  for (const fixture of FIXTURES) {
    await runFixture(fixture);
  }
  console.log(`\n[smoke] ALL PASS (${FIXTURES.length} fixtures).`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[smoke] error:", (e && e.message) || e);
  process.exit(1);
});
