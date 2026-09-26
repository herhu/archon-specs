# Archon Telemetry Mapping Specification

This document defines the official directory structure for Archon Telemetry and Observability data. All components (Emitter, Materializer, Ingestion Service, and Dashboard) MUST adhere to this mapping to ensure cross-stream visibility.

## 1. The Root Authority: `.archon/`

All telemetry data is stored within a hidden `.archon` directory at the project or workspace root.

| Path | Purpose | Format |
| :--- | :--- | :--- |
| `.archon/` | Root telemetry container | Directory |
| `.archon/telemetry.jsonl` | Legacy/Root-level events | JSONL |
| `.archon/runtime.jsonl` | Global runtime/API logs | JSONL |
| `.archon/state.json` | Authoritative workspace state | JSON |
| `.archon/plans/` | Archived Execution Plans | Directory (.json) |
| `.archon/global/` | Shared/Cross-project telemetry | Directory |
| `.archon/projects/` | Scoped telemetry for multi-tenant setups | Directory |

## 2. Scoped Mapping (Recommended)

To support multiple projects within a single workspace, telemetry is partitioned by `projectName`.

### Global Scope
- **Location**: `.archon/global/telemetry.jsonl`
- **Used For**: Discovery, cross-project analysis, and system-wide orchestration events.

### Project Scope
- **Location**: `.archon/projects/{projectName}/telemetry.jsonl`
- **Used For**: Specific mission traces, materialization results, and artifact lineage for a named project.

## 3. Component Mapping Logic

### Telemetry Emitter (`telemetry.ts`)
The emitter resolves the destination path using the following priority:
1. If `workspaceRoot` is set:
   - If `projectName` exists: `.archon/projects/{projectName}/telemetry.jsonl`
   - Else: `.archon/global/telemetry.jsonl`
2. If `workspaceRoot` is NOT set (Legacy/CLI):
   - Search for `.archon` in CWD or parents.

### Ingestion Service (`ingestion.ts`)
The ingestion service scans all official paths during `sync()`:
1. `{source}/.archon/telemetry.jsonl`
2. `{source}/.archon/global/telemetry.jsonl`
3. `{source}/.archon/projects/*/telemetry.jsonl`

## 4. Verification Checklist
- [ ] Emitter writes to `.archon` prefix.
- [ ] Ingestion Service reads from `.archon` prefix.
- [ ] Dashboard `main.ts` initializes `IngestionService` with correct absolute root.
- [ ] `PROJECT_NAME` is consistently passed in telemetry events.
