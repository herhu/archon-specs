import { AsciiParser } from "../dsl/ascii.js";
import { validateDiagramIR } from "../validation/index.js";

const parser = new AsciiParser();

const dsl = `
actor User
actor "Admin User" as Admin
usecase "Login" as UC1
usecase "View Report" as UC2

User --> UC1
Admin --> UC1
Admin --> UC2
`;

console.log("Parsing UseCase DSL...");
const ir = parser.parse(dsl);
console.log("IR generated:", JSON.stringify(ir, null, 2));

console.log("Validating IR...");
const validation = validateDiagramIR(ir);

if (validation.valid) {
  console.log("✅ Use Case Diagram IR is valid!");
  
  const actors = ir.diagrams[0].elements.filter(e => e.type === 'actor');
  const usecases = ir.diagrams[0].elements.filter(e => e.type === 'usecase');
  
  if (actors.length === 2 && usecases.length === 2) {
      console.log("✅ Use Case parsed correctly!");
  } else {
      console.error("❌ Use Case parsing incomplete.");
      process.exit(1);
  }

} else {
  console.error("❌ IR is invalid:", validation.errors);
  process.exit(1);
}
