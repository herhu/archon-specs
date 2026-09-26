import { AsciiParser } from "../dsl/ascii.js";
import { validateDiagramIR } from "../validation/index.js";

const parser = new AsciiParser();

const dsl = `
participant User
participant "API Gateway" as Gateway
participant "Auth Service" as Auth

User -> Gateway : Login Request
Gateway -> Auth : Validate Token
Auth --> Gateway : Token Valid
Gateway --> User : Login Success

alt "Invalid Token" {
  Auth --> Gateway : Token Invalid
}
`;

console.log("Parsing Sequence DSL...");
const ir = parser.parse(dsl);
console.log("IR generated:", JSON.stringify(ir, null, 2));

console.log("Validating IR...");
const validation = validateDiagramIR(ir);

if (validation.valid) {
  console.log("✅ Sequence Diagram IR is valid!");
  
  const msgs = ir.diagrams[0].relationships.filter(r => r.type === 'message');
  
  if (msgs.length >= 4) {
      console.log("✅ Sequence messages parsed!");
      console.log("Message kinds:", msgs.map(m => m.kind));
  } else {
      console.error("❌ Sequence parsing incomplete.");
      process.exit(1);
  }

  // Check fragments
  const fragments = ir.diagrams[0].fragments;
  if (fragments && fragments.length > 0) {
      console.log("✅ Fragments parsed!", fragments.length);
      console.log("Fragment kind:", fragments[0].kind);
  } else {
      console.log("⚠️ No fragments found (but input has 'alt').");
      // Actually input HAS 'alt'. Fail if not found?
      // "alt 'Invalid Token' { ... }"
      if (ir.diagrams[0].relationships.find(r => r.label?.includes("Invalid"))) {
           // Wait, fragment doesn't contain relationship. Relationship is in relationships array.
           // Fragment structure is separate.
           console.error("❌ Expected fragment 'alt' not found!");
           process.exit(1);
      }
  }

} else {
  console.error("❌ IR is invalid:", validation.errors);
  process.exit(1);
}
