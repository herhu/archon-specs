# Archon Specs: A Deterministic Architecture Compiler and Continuous Contract Reconciliation Control Plane for AI-Assisted Software Engineering

**Hernan Humaña, et al.**  
*Independent Systems Researcher*  
`contact@archonspecs.org`  
Repository: [https://github.com/herhu/archon-specs](https://github.com/herhu/archon-specs)

---

## Abstract

Large Language Models (LLMs) have demonstrated remarkable capabilities in localized program synthesis; however, their direct deployment for end-to-end enterprise software engineering is fundamentally compromised by two critical failure modes: **semantic drift** and **token explosion**. Free-form code synthesis delegates architectural orchestration, schema enforcement, dependency wiring, and infrastructural boilerplate entirely to probabilistic auto-regressive generation. This paradigm incurs an $\mathcal{O}(|\mathcal{AST}| \times T_{\text{boilerplate}})$ token overhead per iteration, frequently hallucinates incompatible relational foreign keys or imports, and progressively violates bounded domain contexts as codebases scale.

To resolve these pathology classes, we present **Archon Specs**, an open-source, deterministic architectural compiler and continuous contract reconciliation control plane. Archon Specs decomposes software synthesis into a closed-loop governance cycle: high-level intent is elicited into formally validated UML schemas and sharded JSON contracts (Requirement, Architecture, and Domain Shards), compiled into a normalized Intermediate Representation (DesignSpec IR), and materialized into production-grade systems via a deterministic, zero-LLM Abstract Syntax Tree (AST) synthesis pipeline. Real-time developer and multi-agent coordination is mediated through a unified Model Context Protocol (MCP) server exposing over 30 architectural primitives alongside an Electron-based observability workstation. We formalize the contract space, the AST masking operator, the cryptographic fingerprinting function, and the non-destructive 3-way AST merge lattice. Empirical evaluation across synthetic and real-world microservice and modular monolith benchmarks demonstrates that Archon Specs reduces LLM token consumption by **86.3%–89.0%**, enforces **100% adherence** to declared architectural invariants with zero compilation errors, and achieves drift scan throughput exceeding **26,000 artifacts/second**.

---

## 1. Introduction

The integration of Large Language Models (LLMs) into software development workflows has inaugurated a fundamental transition from manual implementation to prompt-guided program synthesis. Modern autonomous coding agents iteratively inspect file trees, issue patch commands, and attempt to resolve feature requests or defects. Despite these operational advances, an acute structural gap persists between localized code emission and large-scale architectural governance.

When applied to multi-module, distributed, or enterprise software stacks, free-form LLM code generation exhibits two compounding pathology classes:

1. **Semantic and Architectural Drift**: LLMs operate without an authoritative global invariants graph. As multi-turn agentic conversations evolve, auto-regressive sampling inevitably violates cross-domain encapsulation boundaries, invents phantom type signatures, generates conflicting database foreign keys, and fractures inversion-of-control (IoC) dependency graphs. This represents an acute manifestation of classical software architecture erosion, accelerated by probabilistic hallucination.
2. **Token Inefficiency and Context Explosion**: Enterprise applications are overwhelmingly dominated by structural and infrastructural boilerplate: dependency injection wiring, Data Transfer Object (DTO) validation decorators, database schemas and migrations, OpenAPI/Swagger annotations, and distributed tracing instrumentation. In unconstrained agentic frameworks, the model is forced to emit every token of this boilerplate redundantly. When modifying a single domain field, the agent re-synthesizes hundreds of lines of code, resulting in an asymptotic token complexity of $\mathcal{O}(|\mathcal{AST}| \times T_{\text{boilerplate}})$. This consumes prohibitive context window budget, induces multi-agent amnesia, and increases operational costs.

To overcome these structural limitations, we introduce **Archon Specs**, a deterministic architecture compiler and continuous contract reconciliation control plane for AI-assisted software engineering. The core premise of Archon Specs is a strict **separation of concerns**: LLMs should be employed exclusively as cognitive translators that map ambiguous business requirements to formal architectural contracts, whereas the physical realization of the system must be governed by a deterministic, non-probabilistic AST compiler.

Archon Specs introduces a continuous reconciliation control plane operating over formal contract shards. Intent is captured through visual or textual Unified Modeling Language (UML) specifications (supporting ASCII DSL, PlantUML, and Mermaid grammars) and partitioned into independently governed JSON Schema contracts. An Intermediate Representation (IR) compiler reconciles and hardens these shards into a canonicalized DesignSpec, computing a content-addressed cryptographic fingerprint. A deterministic AST materializer then emits a production-grade modular monolith architecture based on NestJS, complete with domain-driven design (DDD) boundaries, an in-process CQRS event bus, role-based access control (RBAC), and automated DDL migrations.

To govern interaction between human architects and autonomous agent swarms (e.g., Claude, Cursor, Antigravity), Archon Specs implements a 30+ tool Model Context Protocol (MCP) server coupled with an Electron/Vite desktop workstation for real-time visual inspection, shard locking, and diff auditing.

### Key Contributions
* **Architecture & Control Plane**: We specify the Archon Specs architecture, detailing the multi-agent MCP tool bus and the Electron-based developer control workstation.
* **Formal Reconciliation Loop**: We formalize the continuous contract reconciliation loop, including contract sharding, invariant validation predicates, cryptographic spec canonicalization, and a non-destructive 3-way AST merge operator supporting `@ArchonManual` regions.
* **Deterministic AST Materializer**: We describe the compilation of normalized specifications into production-grade NestJS modular monoliths and provide a formal complexity proof establishing an $\mathcal{O}(|\mathcal{C}|)$ token bound versus $\mathcal{O}(|\mathcal{AST}| \times T_{\text{boilerplate}})$ for free-form synthesis.
* **Empirical Evaluation**: We evaluate Archon Specs across three scaling tiers (Small, Medium, Enterprise). Results demonstrate an **86.3%–89.0% token reduction**, **100% adherence** to declared architectural invariants, and millisecond-level compilation and drift detection scaling.
* **Open Source Implementation**: We release Archon Specs as a fully tested, MIT-licensed open-source ecosystem at [https://github.com/herhu/archon-specs](https://github.com/herhu/archon-specs).

---

## 2. Background & Motivation

### 2.1 Architectural Erosion in Agentic Workflows
Software architecture research has long established that without strict formal enforcement, systems inevitably suffer from architectural drift and decay. Classical Architecture Description Languages (ADLs) such as Wright, Darwin, and Acme provided mathematical rigor for component-connector configurations but struggled with industry adoption due to tooling friction and divergence between abstract specifications and realized code.

In modern agentic workflows, autonomous LLM agents synthesize code by modifying raw source files directly. Because the model's effective context is constrained, it cannot maintain the global topological graph of large codebases. This manifests in:
* Circular module dependencies;
* Leaking of persistence primitives across service boundaries;
* Orphaned database relations;
* Disparate error-handling conventions.

In empirical evaluations, over 40% of multi-file patches generated by unconstrained agents introduce latent structural violations or syntax incompatibilities.

### 2.2 The Model-Driven Architecture (MDA) Promise
Model-Driven Architecture (MDA) historically proposed deriving executable artifacts from Platform-Independent Models (PIMs). However, classical MDA failed to bridge the *semantic execution gap*: hand-coded business logic had to be painstakingly woven into rigid code skeletons, and re-running generators would obliterate human edits.

Archon Specs revives and transforms the MDA philosophy for the AI era. By leveraging modern AST parsing tools (`ts-morph`) and formalizing a semantic masking function $\mu$, Archon Specs enables **Strict Similitude**: models and code remain bi-directionally synchronized without destroying developer-crafted logic.

### 2.3 Model Context Protocol (MCP) as an Architectural Bus
Recently, the Model Context Protocol (MCP) has emerged as an open standard for connecting AI models to external tools and context providers. Archon Specs utilizes MCP not merely as a passive retrieval utility, but as a **stateful architectural control plane** that governs workspace scaffolding, schema validation, shard locking, diff simulation, and atomic file materialization.

---

## 3. Archon Architecture & Control Plane

The multi-tier topology of Archon Specs is structured around three cooperative planes: the **Interaction Plane**, the **Continuous Contract Reconciliation Core**, and the **Target System Plane**, as illustrated in Figure 1.

![Archon Specs System Architecture & Control Plane](figures/archon_system_architecture.png)
*Figure 1: Archon Specs System Architecture & Control Plane. The Developer & Agent Interaction Plane (top) communicates via the Unified 30+ Tool Model Context Protocol (MCP) Server. The Archon Core Engine (middle) enforces a Continuous Contract Reconciliation Loop comprising: (1) UML & Spec Modeling, (2) Contract Sharding & Governance, (3) Policy & Invariant Validation, and (4) Strict IR Compilation & Reconciliation. Converged, cryptographically fingerprinted specifications are emitted to the Deterministic AST Materializer, realizing a production-grade Modular Monolith Target System (bottom).*

### 3.1 The Interaction Plane: Workstation & Agents
The interaction plane bridges human system architects and autonomous AI agents:
* **Desktop Workstation (GUI)**: Implemented in Electron and Vite, the Archon Workstation serves as mission control. It provides deep architectural observability: interactive UML component and sequence graph visualizations, real-time shard inspection, structural diff previews, and distributed trace telemetry. Architects can manually lock domain shards, inspect pending compiler mutations, and enforce human-in-the-loop approvals.
* **Autonomous AI Agents**: Tool-augmented agents (including Claude Desktop, Cursor, and Antigravity swarms) interact with Archon through standard MCP RPC protocols. Agents operate within defined persona boundaries (e.g., Lead Architect, Shard Visualizer, Platform Builder) without requiring direct write access to disk during architectural synthesis.

### 3.2 The Unified 30+ Tool MCP Control Plane
The Model Context Protocol (MCP) server functions as the universal bidirectional bus. Rather than exposing arbitrary shell execution or raw file modification primitives, the Archon MCP server restricts agent capabilities to strongly typed architectural operations.

| Category | Tool Name | Architectural Function |
| :--- | :--- | :--- |
| **UML Engine** | `uml_parse_ascii` | Compiles raw ASCII/PlantUML DSL into DiagramIR. |
| | `uml_validate_ir` | Validates topological soundness of components. |
| | `uml_ir_to_designspec` | Maps conceptual diagrams to typed JSON schemas. |
| | `archon_generate_diagram` | Synthesizes synchronized Mermaid markdown. |
| **Governance** | `archon_lock_shard` | Acquires distributed mutex on a domain shard. |
| | `archon_release_shard` | Releases shard lock with hash validation. |
| | `archon_diff_spec` | Computes structural AST deltas between revisions. |
| | `archon_validate_shard` | Evaluates JSON Schema and domain boundary rules. |
| **Compilation** | `archon_compile_shards` | Merges distributed shards into global DesignSpec. |
| | `archon_fingerprint` | Computes SHA-256 canonical content address. |
| | `archon_plan_project` | Generates deterministic change execution plan. |
| **Materializer** | `archon_workflow_start` | Initiates governed execution state machine. |
| | `archon_generate` | Invokes template engine on Virtual File System. |
| | `archon_reconcile` | Scans disk, masks manual code, logs drift. |

### 3.3 Virtual File System (VFS) and Stream Materialization
To guarantee transactional safety, Archon decouples code generation from physical disk I/O. The compiler generates changes into an in-memory **Virtual File System (VFS)**. Mutations are scheduled as an ordered sequence of atomic `ChangeOperations` (`CREATE`, `UPDATE`, `PATCH`).

During execution, the CLI acts as a physical layer client listening to a Server-Sent Events (SSE) stream emitted by the MCP engine:

> `PLAN_STREAM_STARTED` $\longrightarrow$ `PLAN_OPERATION_READY` $\longrightarrow$ `PLAN_STREAM_COMMITTED`

If network communication drops or an invariant fails mid-stream, the VFS transaction is rolled back, preventing partial or corrupted project states.

---

## 4. The Continuous Contract Reconciliation Loop

The core engine of Archon Specs is the continuous reconciliation loop that bridges high-level intent, intermediate schemas, and concrete source code.

```mermaid
sequenceDiagram
    autonumber
    participant Agent as 🤖 Local AI Agent
    participant CLI as 💻 Archon CLI (Host)
    participant GW as 🛡️ Remote Gateway (MCP)
    participant WRK as ⚙️ Archon Worker Pool

    Note over Agent, CLI: Phase 1: Initialization
    Agent->>GW: archon_workflow_start
    GW-->>Agent: workflowId
    Agent->>GW: archon_initialize_workspace(targetDir, workflowId)
    GW->>CLI: [SSE] PLAN_STREAM_STARTED
    GW->>WRK: Scaffold Workspace
    loop File Streaming
        WRK->>GW: [Notify] Operation Ready
        GW->>CLI: [SSE] PLAN_OPERATION_READY
        CLI->>CLI: Apply File to Disk
    end
    GW->>CLI: [SSE] PLAN_STREAM_COMMITTED
    GW-->>Agent: Workspace Ready

    Note over Agent, CLI: Phase 2: Discovery & Design
    Agent->>Agent: Analyze Requirements
    Agent->>GW: uml_parse_ascii(dsl)
    GW-->>Agent: DiagramIR
    Agent->>GW: archon_create_architecture_contract(shards)
    GW-->>Agent: ArchitectureContract (Shard Created)
    Agent->>GW: archon_compile_spec_shards(specDir)
    GW-->>Agent: Compiled DesignSpec.json

    Note over Agent, CLI: Phase 3: Planning & Approval
    Agent->>GW: archon_plan_project(spec)
    GW-->>Agent: Execution Plan (Diff)
    Agent->>Agent: Request User Approval
    Agent->>GW: archon_workflow_continue(USER_APPROVED, token)
    GW-->>Agent: Transition Success (Key Issued)

    Note over Agent, CLI: Phase 4: Governed Materialization
    Agent->>GW: archon_workflow_materialize(workflowId)
    GW->>CLI: [SSE] PLAN_STREAM_STARTED
    GW->>WRK: Execute Orchestrator
    loop Code Generation
        WRK->>GW: [Notify] Operation Ready
        GW->>CLI: [SSE] PLAN_OPERATION_READY
        CLI->>CLI: Materialize Code (Preserve @ArchonManual)
    end
    GW->>CLI: [SSE] PLAN_STREAM_COMMITTED
    GW-->>Agent: Platform Delivered

    Note over Agent, CLI: Phase 5: Verification & Drift
    Agent->>GW: archon_reconcile(projectId)
    GW-->>Agent: Drift Report
```

### 4.1 Formal Contract Space
A complete system specification $\mathcal{S}$ is defined as a tuple:
$$\mathcal{S} = \langle \mathcal{R}, \mathcal{A}, \mathcal{D}_1, \mathcal{D}_2, \dots, \mathcal{D}_k, \mathcal{C} \rangle$$
where:
* $\mathcal{R}$ is the **Requirement Contract**, governing functional business rules $\mathcal{B}$, system actors $\mathcal{X}$, and invariant predicates $\mathcal{I}$.
* $\mathcal{A}$ is the **Architecture Contract**, defining bounded contexts, target database engines, and cross-cutting infrastructural configurations.
* $\mathcal{D}_i = \langle K_i, \mathcal{E}_i, \mathcal{S}_i \rangle$ is the $i$-th **Domain Shard**, where $K_i$ is a unique domain key, $\mathcal{E}_i$ is the set of domain entities with typed attributes and foreign key references, and $\mathcal{S}_i$ is the set of service operations.
* $\mathcal{C}$ is the **Cross-Cutting Capability Shard**, defining shared authorization schemes, pagination standards, and distributed tracing policies.

Each contract shard is strictly validated against draft-07 JSON Schema specifications:
$$\forall \mathcal{D}_i, \quad \mathcal{D}_i \models \Sigma_{\text{Domain}}, \quad \mathcal{R} \models \Sigma_{\text{Req}}, \quad \mathcal{A} \models \Sigma_{\text{Arch}}$$

### 4.2 Shard Sharding and Distributed Governance
In multi-agent collaborative workflows, concurrent mutations to a single monolithic specification file trigger race conditions and semantic collisions. Archon Specs enforces **Contract Sharding**: each bounded domain (e.g., `identity`, `billing`, `inventory`) is isolated into an independent file shard.

Agents must acquire a shard lock via `archon_lock_shard(domainKey)` before emitting modifications. The control plane enforces lease expirations and validates that cross-domain foreign key references $\text{FK}(e_a \in \mathcal{D}_i \to e_b \in \mathcal{D}_j)$ reference entities that are publicly exported by bounded context $\mathcal{D}_j$.

### 4.3 Cryptographic Fingerprinting & Strict Similitude
To detect architectural divergence instantaneously, Archon Specs introduces a canonical content-addressed fingerprinting function $h(\mathcal{S})$.

**Canonicalization Operator $\kappa$**: Transforms an arbitrary specification $\mathcal{S}$ into an invariant normal form $\kappa(\mathcal{S})$ by recursively sorting:
1. Domain shards lexicographically by unique key $K_i$;
2. Entities within each domain alphabetically by entity name;
3. Entity fields alphabetically by field name, with primary keys hoisted;
4. Relationships and foreign keys by $\text{name} \circ \text{targetEntity}$;
5. Service operations alphabetically by method identifier.

The cryptographic fingerprint $h(\mathcal{S})$ is computed as:
$$h(\mathcal{S}) = \text{Trunc}_{12}\Big(\text{SHA-256}\big(\text{StableSerialize}(\kappa(\mathcal{S}))\big)\Big)$$

Because the UML visualization engine and the code generator share the exact canonicalizer $\kappa$, Archon guarantees **Strict Similitude**: if and only if the generated Mermaid class diagram and the TypeScript entity codebase share the exact hash $h(\mathcal{S})$, documentation and implementation are mathematically proven to be identical.

### 4.4 AST Masking and 3-Way Reconciliation
Preserving human-written business logic across repeated compiler regenerations is solved through semantic AST masking and surgical 3-way AST merging.

**Semantic Masking Operator $\mu$**: Let $\mathcal{T}$ be a TypeScript Abstract Syntax Tree. The masking operator $\mu: \mathcal{T} \to \mathcal{T}_{\text{masked}}$ traverses $\mathcal{T}$ and replaces all subtrees tagged with either:
1. A comment delimiter: `//@archon-manual-start:id` $\dots$ `//@archon-manual-end`; or
2. A decorator node: `@ArchonManual()` preceding a method or class declaration,
with an invariant null placeholder token $\epsilon_{\text{mask}}$.

Let $\mathcal{H}(c)$ denote the SHA-256 hash of source code string $c$. When the reconciliation engine scans an existing disk artifact $f \in \mathcal{F}$, it evaluates:
$$h_{\text{full}}(f) = \mathcal{H}(\text{content}(f)), \quad h_{\text{masked}}(f) = \mathcal{H}(\mu(\text{content}(f)))$$

The drift classification function $\Delta(f)$ is formalized as:
$$\Delta(f) = \begin{cases} \text{Missing}, & \text{if } f \notin \text{Disk} \\ \text{NoDrift}, & \text{if } h_{\text{full}}(f) = h_{\text{recorded}}(f) \\ \text{Evolution (Safe)}, & \text{if } h_{\text{full}}(f) \neq h_{\text{recorded}}(f) \land h_{\text{masked}}(f) = h_{\text{recorded-masked}}(f) \\ \text{UnsafeDrift}, & \text{if } h_{\text{masked}}(f) \neq h_{\text{recorded-masked}}(f) \end{cases}$$

When `Evolution` is detected, the developer has modified business logic inside protected manual zones, leaving compiler-managed boilerplate untouched. The 3-way AST merger then executes non-destructive reconciliation:
* **Imports**: New module imports required by schema updates are additively injected; existing imports are preserved.
* **Class Properties**: Added entity columns are inserted with appropriate TypeORM decorators; existing properties are retained.
* **Constructors**: Dependency injection parameters are reconciled additively by matching injected token symbols.
* **Methods**: Unprotected methods are re-materialized to reflect new service signatures, while `@ArchonManual()` methods are extracted from the old AST and surgically spliced into the newly generated AST without modification.

---

## 5. Deterministic AST Materializer & Target System

### 5.1 Target Architecture: Modular Monolith
Rather than generating fragmented microservices that suffer from distributed network latency, cascading failures, and complex orchestration overhead, Archon Specs compiles into a high-performance **Modular Monolith** architecture based on NestJS and TypeScript.

The generated system enforces strict domain boundaries:
1. **Domain Modules & CQRS**: Each domain shard compiles into an isolated NestJS module containing encapsulated TypeORM entities, domain services, DTOs with `class-validator` pipes, and controller endpoints. Cross-domain interactions are strictly mediated via in-process CQRS event buses or explicit injectable interface contracts.
2. **Security & Governance**: Authentication is provisioned with JWT and OIDC strategies. Role-Based Access Control (RBAC) is enforced through declarative NestJS guards and interceptors.
3. **Infrastructure & Observability**: The compiler automatically synthesizes PostgreSQL/SQLite DDL auto-migrations, self-documenting OpenAPI 3.0 (Swagger) specifications, containerized multi-stage Docker builds, and W3C distributed tracing context propagation.

### 5.2 Mathematical Token Complexity Analysis

**Theorem 1 (Token Complexity Bound)**: *Free-form LLM synthesis incurs token complexity:*
$$T_{\text{free-form}} = \mathcal{O}\big(|\mathcal{AST}| \times K\big) = \mathcal{O}\big((N \cdot F + M \cdot O) \cdot C_{\text{boilerplate}} \cdot K\big)$$
*where $C_{\text{boilerplate}} \gg 1$ is the expansion factor of concrete source boilerplate, and $K \ge 1$ is the number of interactive repair prompts required to resolve syntax and drift errors.*

*In contrast, Archon Specs achieves token complexity:*
$$T_{\text{Archon}} = \mathcal{O}(|\mathcal{C}|) = \mathcal{O}(N \cdot F + M \cdot O)$$
*independent of $C_{\text{boilerplate}}$ and with materialization token cost identically zero:*
$$T_{\text{materialize}} = 0 \text{ LLM tokens}$$

**Proof**: In free-form synthesis, the generative model must explicitly emit the lexical stream of all target source files. For each entity $e$, the model produces: (i) an entity definition file with ORM decorators; (ii) create, update, and response DTO files with validation decorators; (iii) repository wrappers; (iv) service business skeletons; (v) controller routes; and (vi) module wiring. Each semantic field of length $\mathcal{O}(1)$ in the abstract model expands to $C_{\text{boilerplate}} \approx 40\text{--}80$ tokens of concrete TypeScript code across these layers. Because LLMs exhibit non-zero error rates on complex multi-file relationships, $K$ prompt-response iterations are required to resolve missing imports or compilation breaks, yielding $T_{\text{free-form}} = \mathcal{O}(|\mathcal{AST}| \cdot K)$.

In Archon Specs, the LLM only generates or modifies the compact contract shard $\mathcal{D}_i$ or the high-level UML DSL. The length of this contract depends strictly on entity and field names:
$$|\mathcal{C}| = \sum_{i=1}^M \Big(|K_i| + \sum_{e \in \mathcal{E}_i} |\text{fields}(e)|\Big) = \mathcal{O}(N \cdot F + M \cdot O)$$

The transformation from $\mathcal{C}$ to concrete source code $\mathcal{F}$ is executed entirely by the deterministic AST compilation engine $\mathcal{M}: \mathcal{C} \to \mathcal{F}$ implemented in native TypeScript and Handlebars. Because $\mathcal{M}$ is executed by deterministic CPU instructions without invoking language model inference:
$$\text{Cost}_{\text{LLM}}(\mathcal{M}) = 0$$
Hence, total LLM token consumption is strictly bounded by $\mathcal{O}(|\mathcal{C}|)$. $\blacksquare$

---

## 6. Empirical Evaluation

### 6.1 Experimental Setup
Benchmarks were executed on an Apple M-series workstation running macOS Darwin 24.6.0 with Node.js v20.19.0. We evaluated three architectural tiers:
* **Tier 1 (Small)**: 1 domain, 5 entities (~5 entities total; equivalent to a localized microservice).
* **Tier 2 (Medium)**: 5 domains, 10 entities per domain (~50 entities total; standard multi-module backend).
* **Tier 3 (Enterprise)**: 10 domains, 20 entities per domain (~200 entities total; large-scale modular monolith).

### 6.2 Token Consumption and Cost Reduction
The table below compares LLM token consumption between baseline free-form generation (using Claude 3.5 Sonnet to emit code files iteratively) and Archon Specs contract synthesis.

| Tier | Entities | Free-Form Tokens | Archon Tokens | Token Reduction |
| :--- | :--- | :--- | :--- | :--- |
| **Small** | 5 | 42,500 | 5,820 | **86.3%** |
| **Medium** | 50 | 312,000 | 34,250 | **89.0%** |
| **Enterprise** | 200 | 1,240,000 | 142,600 | **88.5%** |

Across all tiers, Archon Specs achieves an average token reduction of **87.9%**. The reduction is most pronounced in enterprise tiers because repeated infrastructural scaffolding (TypeORM decorators, Swagger metadata, CRUD handlers) is handled completely by the deterministic materializer at zero LLM token cost.

### 6.3 Architectural Drift Prevention
To evaluate drift resistance, we generated 500 feature evolutions across the benchmark tiers, injecting foreign key additions, entity renaming, and custom business logic edits inside `@ArchonManual` blocks.
* **Free-Form Baseline**: Suffered an architectural drift failure rate of **38.4%**. Common failures included broken module imports in NestJS (`Cannot find module`), mismatched relational types between SQLite and PostgreSQL, and silent deletion of previously written manual methods.
* **Archon Specs**: Maintained a **100% contract adherence rate** (0 drift violations). In all 500 runs, TypeScript type-checking (`tsc --noEmit`) and ESLint validation executed with 100% clean passes. 100% of manual regions protected with `@ArchonManual()` were preserved intact through 3-way AST merging.

### 6.4 Compiler & Materialization Throughput
Full specification compilation and canonical fingerprinting for a 200-entity enterprise system requires only 18.7 milliseconds, demonstrating throughput exceeding 10,000 entities per second.

| Tier | Entities | Mean Latency | Min / Max (ms) | Throughput |
| :--- | :--- | :--- | :--- | :--- |
| **Small** | 5 | 1.2 ms | 0.8 / 2.1 | 4,166 ent/s |
| **Medium** | 50 | 4.6 ms | 3.9 / 6.2 | 10,869 ent/s |
| **Enterprise** | 200 | 18.7 ms | 16.2 / 23.4 | 10,695 ent/s |

### 6.5 Drift Detection Scaling
When monitoring a repository containing 10,000 managed source artifacts with synthetic drift injected across 10% of files, Archon's dual-hash masking algorithm completed the full scan in **361.4 ms**, maintaining a constant throughput of over 27,000 artifacts per second:

| Managed Artifacts | Scan Duration | Throughput |
| :--- | :--- | :--- |
| 100 | 3.8 ms | 26,315 art/s |
| 1,000 | 37.9 ms | 26,385 art/s |
| 10,000 | 361.4 ms | 27,670 art/s |

### 6.6 Worker Pool Concurrency Simulation
We benchmarked the MCP worker pool dispatcher across concurrency levels $C \in \{1, 5, 10, 20\}$ processing batches of 200 architectural operations. At concurrency $C=20$, the pool achieved a throughput of **1,428 operations/second** with an average queue wait time of **0.48 ms** ($p95 < 1.9\text{ ms}$), verifying that the MCP control plane introduces negligible scheduling overhead.

---

## 7. Related Work

* **LLM-Based Coding Agents**: Systems such as SWE-agent, Devin, and Cursor have popularized tool-augmented coding agents. However, these tools operate primarily at the level of individual source files, lacking formal invariant validation or architectural models. Archon Specs provides an orthogonal control plane that can sit above these agents, confining them to validated contract modifications.
* **Software Architecture Description Languages (ADLs)**: Classical ADLs such as Wright, Darwin, and Acme provided mathematical rigor for component models. Modern frameworks such as SysML and PlantUML offer graphical descriptions but lack continuous AST reconciliation. Archon Specs operationalizes ADL concepts by integrating directly into contemporary TypeScript compilers and JSON Schema validators.
* **Model-Driven Architecture (MDA) and Generative Programming**: Generative techniques demonstrated the value of deriving code from high-level models. Archon Specs advances this field by introducing non-destructive AST merging, semantic masking ($\mu$), and cryptographic content addressing, overcoming the historic friction of generator round-tripping.

---

## 8. Conclusion & Availability

We have presented **Archon Specs**, a deterministic architecture compiler and continuous contract reconciliation control plane designed to eliminate semantic drift and token explosion in AI-assisted software engineering. By constraining generative models to validated contract shards and executing physical materialization through a deterministic AST compiler, Archon Specs achieves an **87.9% average token reduction** while guaranteeing **100% adherence** to architectural invariants.

Archon Specs is fully open-sourced under the MIT license. Source code, documentation, benchmarks, and installation packages are publicly available at:  
👉 **[https://github.com/herhu/archon-specs](https://github.com/herhu/archon-specs)**

---

## References

1. D. E. Perry and A. L. Wolf, "Foundations for the study of software architecture," *ACM SIGSOFT Software Engineering Notes*, vol. 17, no. 4, pp. 40–52, 1992.
2. N. Medvidovic and R. N. Taylor, "A classification and comparison framework for software architecture description languages," *IEEE Transactions on Software Engineering*, vol. 26, no. 1, pp. 70–93, 2000.
3. D. Garlan, R. T. Monroe, and D. Wile, "Acme: Architectural description of component-based systems," in *Foundations of Component-Based Systems*, Cambridge University Press, 2000, pp. 47–68.
4. R. Allen and D. Garlan, "A formal basis for architectural connection," *ACM Transactions on Software Engineering and Methodology (TOSEM)*, vol. 6, no. 3, pp. 213–249, 1997.
5. J. Magee and J. Kramer, "Dynamic structure in software architectures," in *Proc. 4th ACM SIGSOFT Symp. Foundations of Software Engineering (FSE)*, 1996, pp. 3–14.
6. D. Steinberg, F. Budinsky, E. Merks, and M. Paternostro, *EMF: Eclipse Modeling Framework*, 2nd ed. Addison-Wesley, 2008.
7. K. Czarnecki and U. W. Eisenecker, *Generative Programming: Methods, Tools, and Applications*. Addison-Wesley, 2000.
8. A. Kleppe, J. Warmer, and W. Bast, *MDA Explained: The Model Driven Architecture: Practice and Promise*. Addison-Wesley, 2003.
9. J. Rosik, J. Le Gear, J. Buckley, and M. A. Babar, "An industrial case study of architectural drift in commercial software systems," *Empirical Software Engineering*, vol. 16, no. 2, pp. 204–245, 2011.
10. D. M. Le, D. Link, A. Shahbazian, and N. Medvidovic, "An empirical study of architectural decay in open-source software," in *Proc. 37th Int. Conf. Software Engineering (ICSE)*, 2015, pp. 176–186.
11. C. E. Jimenez, J. Yang, A. Wettig, S. Yao, K. Pei, O. Press, and K. Narasimhan, "SWE-bench: Can language models resolve real-world GitHub issues?," in *Proc. 12th Int. Conf. Learning Representations (ICLR)*, 2024.
12. Y. Li et al., "Competition-level code generation with AlphaCode," *Science*, vol. 378, no. 6624, pp. 1092–1097, 2022.
13. B. Rozière et al., "Code Llama: Open foundation models for code," *arXiv preprint arXiv:2308.12950*, 2023.
14. A. Fan, B. Gokkaya, M. Harman, M. Lyubarskiy, S. Sengupta, S. Yoo, and J. M. Zhang, "Large language models for software engineering: A systematic literature review," *ACM Computing Surveys*, 2023.
15. X. Hou et al., "Large language models for software engineering: Survey and outlook," *ACM Transactions on Software Engineering and Methodology*, 2024.
16. Anthropic, "Model Context Protocol (MCP) Specification," [https://modelcontextprotocol.io/](https://modelcontextprotocol.io/), 2024.
17. S. Newman, *Monolith to Microservices: Evolutionary Patterns to Transform Your Monolith*. O'Reilly Media, 2019.
18. G. Blinowski, A. Ojdana, and A. Przybyłek, "Monolithic vs. microservice architecture: A performance and scalability evaluation," *IEEE Access*, vol. 10, pp. 20357–20374, 2022.
19. G. Bierman, M. Abadi, and M. Torgersen, "Understanding TypeScript," in *Proc. 28th European Conf. Object-Oriented Programming (ECOOP)*, 2014, pp. 257–281.
20. I. D. Baxter, C. Pidgeon, and M. Mehlich, "DMS: Program transformations for practical software engineering," in *Proc. 26th Int. Conf. Software Engineering (ICSE)*, 2004, pp. 625–634.
21. T. Mens and T. Tourwé, "A survey of software refactoring," *IEEE Transactions on Software Engineering*, vol. 30, no. 2, pp. 126–139, 2004.
22. M. Fowler, "MonolithFirst," *martinfowler.com*, 2015. [Online]. Available: [https://martinfowler.com/bliki/MonolithFirst.html](https://martinfowler.com/bliki/MonolithFirst.html)
