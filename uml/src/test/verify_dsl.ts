
import { AsciiParser } from "../dsl/ascii.js";
import { validateDiagramIR } from "../validation/index.js";

const parser = new AsciiParser();

const dsl = `
class User {
  +id: UUID
  +email: string
}

class Post {
  +title: string
}

User -- Post : wrote
`;

console.log("Parsing DSL...");
const ir = parser.parse(dsl);
console.log("IR generated:", JSON.stringify(ir, null, 2));

console.log("Validating IR...");
const validation = validateDiagramIR(ir);

import { transformIRToDesignSpec } from "../transform/spec.js";

// ... (existing code)

if (validation.valid) {
  console.log("✅ IR is valid!");
  
  console.log("Generating DesignSpec...");
  const spec = transformIRToDesignSpec(ir);
  console.log("DesignSpec generated:", JSON.stringify(spec, null, 2));

  if (spec.domains.length > 0 && spec.domains[0].entities.length === 2) {
      console.log("✅ DesignSpec looks correct!");
  } else {
      console.error("❌ DesignSpec is missing entities!");
      process.exit(1);
  }

} else {
  console.error("❌ IR is invalid:", validation.errors);
  process.exit(1);
}
