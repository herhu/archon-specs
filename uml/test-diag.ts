import { generateModelDiagram, generateSequenceDiagram } from './src/transform/mermaid.js';
import { DesignSpec } from './src/transform/spec.js';

const mockSpec: DesignSpec = {
    name: "Test Project",
    version: "1.0.0",
    domains: [
        {
            name: "Core",
            entities: [
                {
                    name: "User",
                    primaryKey: "id",
                    fields: [
                        { name: "id", type: "uuid", primary: true },
                        { name: "email", type: "string" }
                    ]
                }
            ],
            services: []
        }
    ]
};

const diagram = generateModelDiagram(mockSpec);
console.log(diagram);
console.log("-------------------------");
console.log("Encoded JSON:", JSON.stringify({ diagram }));
