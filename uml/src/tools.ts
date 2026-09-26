import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AsciiParser } from "./dsl/ascii.js";
import { validateDiagramIR } from "./validation/index.js";
import { transformIRToDesignSpec } from "./transform/spec.js";
import { DiagramIRSchema } from "./schema/ir.js";
import { ToolCategory } from "./utils/mcp-observer.js";
import { registerObservedTool } from "./utils/mcp-observer.js";

// Initialize parser once (stateless?)
const parser = new AsciiParser();

export function registerTools(server: McpServer) {
    registerObservedTool(
        server,
        "uml_parse_ascii",
        {
            description: "Parse ASCII DSL text into DiagramIR.",
            inputSchema: {
                text: z.string().describe("The ASCII DSL text to parse.")
            },
            category: ToolCategory.PLANNING,
            serverName: "uml-mcp"
        },
        async ({ text }) => {
            try {
                const ir = parser.parse(text);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(ir, null, 2)
                        }
                    ]
                };
            } catch (err: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error parsing ASCII DSL: ${err.message}`
                        }
                    ],
                    isError: true
                };
            }
        }
    );

    registerObservedTool(
        server,
        "uml_validate_ir",
        {
            description: "Validate a DiagramIR object.",
            inputSchema: {
                ir: z.any().describe("The DiagramIR JSON object.")
            },
            category: ToolCategory.VALIDATION,
            serverName: "uml-mcp"
        },
        async ({ ir }) => {
            const result = validateDiagramIR(ir);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            };
        }
    );

    registerObservedTool(
        server,
        "uml_ir_to_designspec",
        {
            description: "Transform DiagramIR into Archon DesignSpec v1.",
            inputSchema: {
                ir: z.any().describe("The DiagramIR JSON object.")
            },
            category: ToolCategory.PLANNING,
            serverName: "uml-mcp"
        },
        async ({ ir }) => {
            // Validate first?
            const validation = validateDiagramIR(ir);
            if (!validation.valid) {
                return {
                    content: [{ type: "text", text: `Invalid IR: ${JSON.stringify(validation.errors)}` }],
                    isError: true
                };
            }

            try {
                // Re-parse to get typed object via Zod for safety before passing to transform
                const parsedIR = DiagramIRSchema.parse(ir);
                const spec = transformIRToDesignSpec(parsedIR);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(spec, null, 2)
                        }
                    ],
                    structuredContent: { spec }
                };
            } catch (err: any) {
                return {
                    content: [{ type: "text", text: `Transformation Error: ${err.message}` }],
                    isError: true
                };
            }
        }
    );
    
    registerObservedTool(
        server,
        "uml_ir_to_shards",
        {
            description: "Transform DiagramIR directly into individual Domain Shards for materialization.",
            inputSchema: {
                ir: z.any().describe("The DiagramIR JSON object.")
            },
            category: ToolCategory.PLANNING,
            serverName: "uml-mcp"
        },
        async ({ ir }) => {
            console.error(`[TRACE:SERVER:uml-mcp] uml_ir_to_shards started`);
            try {
                const parsedIR = DiagramIRSchema.parse(ir);
                const spec = transformIRToDesignSpec(parsedIR);
                
                // Return domains as individual shard objects
                const shards = spec.domains.map(domain => ({
                    name: domain.name,
                    key: domain.key,
                    entities: domain.entities,
                    services: domain.services
                }));

                return {
                    content: [
                        {
                            type: "text",
                            text: `Generated ${shards.length} shards from IR.`
                        }
                    ],
                    structuredContent: { shards }
                };
            } catch (err: any) {
                console.error(`[TRACE:SERVER:uml-mcp] Shard Transformation Error: ${err.message}`);
                return {
                    content: [{ type: "text", text: `Shard Transformation Error: ${err.message}` }],
                    isError: true
                };
            }
        }
    );

    registerObservedTool(
        server,
        "uml_ir_to_mermaid",
        {
            description: "Transform DiagramIR into a Mermaid class diagram.",
            inputSchema: {
                ir: z.any().describe("The DiagramIR JSON object.")
            },
            category: ToolCategory.PLANNING,
            serverName: "uml-mcp"
        },
        async ({ ir }) => {
            console.error(`[TRACE:SERVER:uml-mcp] uml_ir_to_mermaid started`);
            try {
                const { generateModelDiagram } = await import("./transform/mermaid.js");
                const { transformIRToDesignSpec } = await import("./transform/spec.js");
                const parsedIR = DiagramIRSchema.parse(ir);
                const spec = transformIRToDesignSpec(parsedIR);
                const mermaid = generateModelDiagram(spec);
                return {
                    content: [
                        {
                            type: "text",
                            text: mermaid
                        }
                    ]
                };
            } catch (err: any) {
                console.error(`[TRACE:SERVER:uml-mcp] Mermaid Error: ${err.message}`);
                return {
                    content: [{ type: "text", text: `Mermaid Error: ${err.message}` }],
                    isError: true
                };
            }
        }
    );

    registerObservedTool(
        server,
        "archon_check_drift",
        {
            description: "Detect whether a materialized project is STALE relative to the current DesignSpec. Compares the spec's structural fingerprint against the fingerprint the project was last materialized from (found in docs/architecture.md as 'Spec fingerprint: <hash>'). Returns the exact remediation steps when drift is found.",
            inputSchema: {
                spec: z.any().describe("The current DesignSpec JSON object."),
                materializedFingerprint: z.string().optional().describe("The fingerprint recorded in the materialized project (docs/architecture.md). Omit if the project has never been materialized.")
            },
            category: ToolCategory.VALIDATION,
            serverName: "uml-mcp"
        },
        async ({ spec, materializedFingerprint }) => {
            const { computeSpecFingerprint } = await import("./transform/utils/fingerprint.js");
            const current = computeSpecFingerprint(spec);
            const fresh = !!materializedFingerprint && materializedFingerprint === current;
            const remediation = [
                "1. archon_compile_spec_shards   (rebuild DesignSpec from shards)",
                "2. archon_plan_project          (replan against the new spec)",
                "3. archon_workflow_materialize  (regenerate src/ + docs/architecture.md)"
            ];
            const report = {
                status: fresh ? "FRESH" : "STALE",
                currentSpecFingerprint: current,
                materializedFingerprint: materializedFingerprint ?? null,
                message: fresh
                    ? "The materialized project matches the current spec. No regeneration needed."
                    : materializedFingerprint
                        ? `DRIFT: the project on disk was built from spec ${materializedFingerprint} but the current spec is ${current}. The code does NOT reflect your latest design. Rendering a new diagram does NOT fix this — you must re-materialize.`
                        : `The project has not been materialized from this spec yet (current fingerprint ${current}).`,
                remediation: fresh ? [] : remediation
            };
            return {
                content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
                structuredContent: report,
                isError: !fresh && !!materializedFingerprint
            };
        }
    );

    registerObservedTool(
        server,
        "archon_generate_diagram",
        {
            description: "Generate architecture and sequence diagrams from a DesignSpec.",
            inputSchema: {
                spec: z.any().describe("The DesignSpec JSON object."),
                type: z.enum(["class", "sequence", "both", "model"]).optional().default("both").describe("Type of diagram to generate.")
            },
            category: ToolCategory.PLANNING,
            serverName: "uml-mcp"
        },
        async ({ spec, type }) => {
            console.error(`[TRACE:SERVER:uml-mcp] archon_generate_diagram started for type: ${type}`);
            try {
                const { generateModelDiagram, generateSequenceDiagram } = await import("./transform/mermaid.js");
                let result = "";
                
                if (type === "class" || type === "model" || type === "both") {
                    result += "### Class Diagram\n```mermaid\n" + generateModelDiagram(spec) + "\n```\n\n";
                }
                
                if (type === "sequence" || type === "both") {
                    result += "### Sequence Diagram\n```mermaid\n" + generateSequenceDiagram(spec) + "\n```\n";
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: result
                        }
                    ]
                };
            } catch (err: any) {
                console.error(`[TRACE:SERVER:uml-mcp] Diagram Generation Error: ${err.message}`);
                return {
                    content: [{ type: "text", text: `Diagram Generation Error: ${err.message}` }],
                    isError: true
                };
            }
        }
    );
}
