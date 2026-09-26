# 🌌 Archon MCP Client CLI

The `archonspecs` CLI is a powerful, silent bridge that connects your local development environment to the **Archon Control Plane**. It serves as the primary interface for AI agents to interact with the Archon ecosystem.

## 🚀 Key Features

### 1. The MCP-to-SSE Bridge
The client acts as a high-performance proxy between standard **stdio-based MCP** clients (like Cursor, Claude Desktop, or Antigravity) and the remote **SSE (Server-Sent Events)** Archon backend.

### 2. 🏗️ Enterprise-Grade Materialization
The client implements a durable and resumable materialization pipeline:
- **Idempotency**: Safely repeat materialization tasks without side effects.
- **Resumability**: Uses a local journal (`.archon/sync.journal`) to resume interrupted syncs from the exact point of failure.
- **Progress Tracking**: Real-time heartbeat pulses sent back to the remote control plane.
- **Atomic Commits**: Finalizes the project state in `.archon/lineage.json` only after all operations succeed.

### 3. 🛡️ Smart Code Preservation (Region Management)
Archon protects your manual logic during re-generation using a two-tier strategy:
- **Decorator-based**: Automatically detects and preserves methods marked with `@ArchonManual()`.
- **Comment-based**: Surgically merges code inside `// @archon-manual-start:<id>` blocks.
- **Surgical Merging**: New templates are generated, and then your custom regions are "surgically" re-injected into the new files before they are written to disk.

### 4. 🛠️ Local Tool Surface
The client augments the remote toolset with exclusive local capabilities:
- `archon_read_local_lineage`: Retrieves the current project identity and revision.
- `archon_verify_local`: Runs integrity checks on the local codebase.
- `archon_diff_local`: Previews structural and file changes before materialization.
- `archon_workflow_materialize`: Initiates the full handshake and materialization cycle.
- `archon_sync_via_artifact`: Performs a smart merge from a remote ZIP artifact (S3).

### 5. 🔒 Safety & Concurrency
- **Sync Locking**: Prevents multiple agents or processes from mutating the same workspace simultaneously via `.archon/sync.lock`.
- **Git Awareness**: Detects uncommitted changes and provides warnings to prevent accidental overwrites.

---

### General Commands
```bash
# Show help
archonspecs --help

# Show version
archonspecs --version

# Set authentication token
archonspecs -token YOUR_SECRET_TOKEN
```

### As an MCP Server (Standard)
Configure your IDE to use the client as a command:
```bash
npx -y archonspecs <REMOTE_SSE_URL>?apiKey=<YOUR_API_KEY>
```

### Standalone Materialization
Manually trigger a project build/sync from the terminal:
```bash
archonspecs materialize <projectId> --url <REMOTE_URL> --outDir <LOCAL_PATH>
```

### Environment Variables
- `ARCHON_URL`: Override the default server endpoint.
- `ARCHON_TOKEN`: Bearer token for authentication.
- `DEBUG`: Set to `true` to enable verbose stack traces.

---
*Archon: The Agentic Architectural Engine.*
