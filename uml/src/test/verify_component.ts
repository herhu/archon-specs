import { AsciiParser } from "../dsl/ascii.js";
import { validateDiagramIR } from "../validation/index.js";

const parser = new AsciiParser();

const dsl = `
component "User Service" as UserService {
  provides api: IUserApi
  requires db: IUserDb
}

component "Database" as Db {
  provides port: IUserDb
}

interface IUserApi
interface IUserDb

UserService ..> Db : uses
`;

console.log("Parsing Component DSL...");
const ir = parser.parse(dsl);
console.log("IR generated:", JSON.stringify(ir, null, 2));

console.log("Validating IR...");
const validation = validateDiagramIR(ir);

if (validation.valid) {
  console.log("✅ Component Diagram IR is valid!");
  
  const comp = ir.diagrams[0].elements.find(e => e.type === 'component');
  if (comp && comp.ports && comp.ports.length === 2) {
      console.log("✅ Component parsed with ports!");
  } else {
      console.error("❌ Component parsing incomplete.");
      process.exit(1);
  }

} else {
  console.error("❌ IR is invalid:", validation.errors);
  process.exit(1);
}
