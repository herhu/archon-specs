<div align="center">
  <img src="./logo.svg" width="80" height="80" alt="Archon Specs Logo" />
  <h1>Archon Specs</h1>
  <p><strong>The Open Source AI Architecture Compiler for Production Systems</strong></p>
  <p>Transforms high-level intent into validated, deterministic, production-grade backend systems.</p>

  <p>
    <a href="https://github.com/herhu/archon-specs/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
    <a href="https://www.npmjs.com/package/archonspecs"><img src="https://img.shields.io/npm/v/archonspecs.svg" alt="npm version"></a>
    <img src="https://img.shields.io/badge/Protocol-MCP%20v1.0-8A2BE2.svg" alt="MCP v1.0">
    <img src="https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg" alt="Node Version">
  </p>
</div>

---

## ⚡ What is Archon Specs?

Most AI developer tools generate raw, unstructured code snippets that hallucinate and drift from architectural standards.

**Archon Specs compiles systems.**

1. **Elicitation & Validation**: High-level requirements are compiled into a strictly typed, schema-validated contract (`RequirementContract`, `ArchitectureContract`, and `DesignSpec`).
2. **Deterministic Materialization**: Code is compiled via template-driven AST generators without runtime LLM guessing, ensuring 100% reproducible backends.
3. **Production Baselines**: Generates NestJS architectures complete with TypeORM entities, repositories, authentication guards, Swagger documentation, health checks, BullMQ queues, and Docker configurations from day one.

---

## 📂 Repository Structure

This repository is organized into modular workspaces:

```text
archon-specs/
├── cli/                 # Official CLI & Model Context Protocol (MCP) bridge
├── core/                # Core architecture compilation & AST materialization engine
├── desktop/             # Electron + Vite Desktop GUI (Mission Control & Compiler Lab)
├── uml/                 # UML parser & Mermaid diagram conversion engine
├── RequirementContract.schema.json
├── ArchitectureContract.schema.json
└── LICENSE              # MIT License
```

---

## 🚀 Quickstart: Archon CLI

### 1. Install Globally
```bash
npm install -g archonspecs
```

### 2. Model Context Protocol (MCP) Integration

Archon Specs is fully compliant with the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). Register the tool in your preferred IDE:

#### Claude Desktop
Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "archonspecs-mcp": {
      "command": "npx",
      "args": ["-y", "archonspecs"]
    }
  }
}
```

*Config Locations:*
* **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### Cursor / Antigravity IDE
Add as a new MCP server:
* **Command**: `archonspecs`
* **Transport**: `stdio`

---

## 🖥️ Archon Desktop App (GUI)

The Archon Desktop App provides a visual dashboard for interactive system compilation, lineage tracing, and tool inspection.

### Running Locally:
```bash
cd desktop
npm install
npm run dev
```

Key features:
* **Mission Control**: Visualize architectural drift, module health, and validation lineage.
* **Compiler Lab**: Test and preview code generation from custom `DesignSpec` definitions.
* **MCP Inspector**: Real-time telemetry and tool request tracing.

---

## 🧱 The Architecture Contract

Archon enforces clear boundaries using JSON Schemas:

* **[RequirementContract](RequirementContract.schema.json)**: Functional requirements, user stories, domain constraints.
* **[ArchitectureContract](ArchitectureContract.schema.json)**: Services, bounded contexts, database providers, and messaging patterns.
* **DesignSpec**: The normalized blueprint used by the compiler to materialize files deterministically.

---

## 🧪 Testing the Engine

To run the unit and integration tests for the core compiler:

```bash
cd core
npm install
npm test
```

---

## 🤝 Contributing

We welcome community contributions! Whether you are adding new template stacks (e.g., Go, FastAPI, Spring), enhancing schemas, or improving developer experience:

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/my-new-feature`)
3. Commit your changes (`git commit -m 'feat: add support for Redis streams'`)
4. Push to the branch (`git push origin feat/my-new-feature`)
5. Open a Pull Request

---

## 📄 License

Archon Specs is open source software licensed under the [MIT License](LICENSE).
