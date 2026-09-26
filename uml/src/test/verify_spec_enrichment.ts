import { AsciiParser } from "../dsl/ascii.js";
import { transformIRToDesignSpec } from "../transform/spec.js";
import { validateDiagramIR } from "../validation/index.js";

const parser = new AsciiParser();

// Combine Class (to define Service) and Sequence (to add operations)
const dsl = `
class User {
  +name: string
}

participant "User Service" as UserService

User -> UserService : Login
`;

console.log("Parsing Combined DSL...");
// Note: My naive parser puts everything in one "diagram" object or array.
// But AsciiParser.parse returns ONE DiagramIR with potentially multiple diagrams if they were separate blocks?
// My current parser implementation puts everything in one diagram unless I changed it?
// Looking at code: "const diagram = this.parseDiagram(tokens); diagrams.push(diagram);"
// It creates ONE diagram from input.
// If I mix class and sequence syntax, 'diagramKind' flips. 
// Let's see if 'Class' definitions and 'Sequence' participants coexist in one diagram 'elements' array.
// Yes they do in my parser.
// However, 'transformIRToDesignSpec' iterates 'classDiagrams' and 'sequenceDiagrams'.
// It filters by 'kind'.
// If 'diagram.kind' is 'sequence' (last won), then 'classDiagrams' filter might miss it?
// Let's check 'transformIRToDesignSpec': 
// const classDiagrams = ir.diagrams.filter(d => d.kind === 'class');
// If I have one diagram that is mixed, it has one kind.
// If it flips to 'sequence', then 'classDiagrams' won't process it.
// Issue: transform logic expects separate diagrams or consistent logic?
// Fix: I should probably allow 'kind=mixed' or iterate elements regardless of diagram kind for classes?
// OR, I should support multiple diagrams in one file (not supported by simple parser yet).
// Hack for now: Ensure parser logic handles 'class' elements even if kind is 'sequence'.
// Actually, 'transformIRToDesignSpec' should be smarter. 
// It should look for classes in ALL diagrams, not just 'class' kind diagrams.

const ir = parser.parse(dsl);
console.log("IR Kind:", ir.diagrams[0].kind); 
// If it sees '->', kind becomes 'sequence'.

// Let's rely on the fact that I should update transform logic to be wider,
// OR update test to split inputs? parse() takes one string.
// Let's run and see failures.

const spec = transformIRToDesignSpec(ir);
console.log("Spec:", JSON.stringify(spec, null, 2));

const userService = spec.domains[0]?.services.find(s => s.name === 'UserService');
if (userService && userService.operations?.find(o => o.name === 'Login')) {
    console.log("✅ Operation 'Login' found in UserService!");
} else {
    // This will likely fail if transform logic filters strictly by kind.
    console.log("⚠️ Operation not found or Service not found.");
}
