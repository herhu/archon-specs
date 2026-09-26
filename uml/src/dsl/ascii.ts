import { DiagramIR } from "../schema/ir.js";
import { randomUUID, createHash } from "node:crypto";

// Simple ID generator
function generateId(): string {
  return "gen-" + randomUUID();
}

interface Token {
  type: string;
  value: string;
  line: number;
  col: number;
}

interface Diagnostic {
  severity: "info" | "warning" | "error";
  message: string;
  span?: {
    startLine: number, startCol: number, endLine: number, endCol: number
  };
}

export class AsciiParser {
  private input: string = "";
  private diagnostics: Diagnostic[] = [];
  private tokens: Token[] = [];
  private current = 0;

  // Current Diagram State
  private diagrams: any[] = [];
  private currentElements: any[] = [];
  private currentRelationships: any[] = [];
  private currentFragments: any[] = [];
  private currentKind = "class";
  private currentName = "Untitled";
  private currentKey: string | undefined = undefined;

  constructor() {}

  /**
   * Main entry point for parsing DSL text into DiagramIR
   */
  parse(input: string): DiagramIR {
    this.input = input;
    this.diagnostics = [];
    this.current = 0;
    this.resetDiagramState();
    this.diagrams = [];

    this.tokens = this.tokenize(input);
    this.parseLoop();
    this.finalizeDiagram(); // Finalize the last diagram in progress

    const ir: DiagramIR = {
      version: "1.0.0",
      source: {
        kind: "ascii-dsl",
        text: input
      },
      diagrams: this.diagrams,
      warnings: this.diagnostics.length > 0 ? this.diagnostics : undefined
    };

    ir.fingerprint = this.calculateFingerprint(ir);
    return ir;
  }

  private resetDiagramState() {
    this.currentElements = [];
    this.currentRelationships = [];
    this.currentFragments = [];
    this.currentName = "Untitled";
    this.currentKey = undefined;
    this.currentKind = "class";
  }

  private startNewDiagram(name: string, key?: string) {
    this.finalizeDiagram();
    this.currentName = name;
    this.currentKey = key;
  }

  private finalizeDiagram() {
    if (this.currentElements.length > 0 || this.currentRelationships.length > 0) {
      this.diagrams.push({
        id: generateId(),
        kind: this.currentKind,
        name: this.sanitizeName(this.currentName),
        key: this.currentKey,
        elements: this.currentElements,
        relationships: this.currentRelationships,
        fragments: this.currentFragments.length > 0 ? this.currentFragments : undefined
      });
    }
    this.resetDiagramState();
  }

  private parseLoop() {
    while (!this.isAtEnd()) {
      const token = this.peek();
      if (!token || token.type === 'NEWLINE') {
        this.advance();
        continue;
      }

      try {
        if (this.match('domain')) {
          this.parseDomain();
        } else if (this.match('class', 'entity')) {
          this.parseClass();
        } else if (this.match('service')) {
          this.parseService();
        } else if (this.match('component')) {
          this.parseComponent();
        } else if (this.match('participant')) {
          this.parseParticipant();
        } else if (this.isRelationshipStart()) {
          this.parseRelationship();
        } else {
          // Skip unknown tokens to avoid infinite loops
          this.advance();
        }
      } catch (e: any) {
        this.error(`Parsing error: ${e.message}`, token);
        this.syncToNextLine();
      }
    }
  }

  // --- Specialized Parsers ---

  private parseDomain() {
    const nameToken = this.consume('IDENT', "Expected domain name");
    const name = nameToken.value;
    let key: string | undefined = undefined;

    while (this.peek() && !this.check('{') && !this.checkType('NEWLINE')) {
      const attr = this.advance();
      if (attr.value === 'key') {
        if (this.match('=')) { /* skip */ }
        key = this.advance().value;
      }
    }

    this.startNewDiagram(name, key);
    if (this.match('{')) { /* body starts */ }
  }

  private parseClass() {
    const nameToken = this.consume('IDENT', "Expected class/entity name");
    const sanitizedName = this.sanitizeName(nameToken.value);
    
    const clazz: any = {
      id: sanitizedName,
      type: "classifier",
      kind: "class",
      name: sanitizedName,
      attributes: [],
      operations: []
    };

    if (this.match('as')) {
      clazz.id = this.sanitizeName(this.consume('IDENT', "Expected alias").value);
    }

    if (this.match('{')) {
      while (!this.isAtEnd() && !this.check('}')) {
        this.parseClassMember(clazz);
      }
      this.match('}');
    }

    this.currentElements.push(clazz);
  }

  private parseService() {
    const nameToken = this.consume('IDENT', "Expected service name");
    const sanitizedName = this.sanitizeName(nameToken.value);
    
    const service: any = {
      id: sanitizedName,
      type: "service",
      name: sanitizedName,
      entity: "None",
      operations: []
    };

    if (this.match('{')) {
      while (!this.isAtEnd() && !this.check('}')) {
        const token = this.advance();
        if (token.value === 'entity') {
          service.entity = this.sanitizeName(this.consume('IDENT', "Expected entity name in service").value);
        } else {
            // Future: parse operations inside service block
        }
      }
      this.match('}');
    }

    this.currentElements.push(service);
  }

  private parseClassMember(clazz: any) {
    const token = this.advance();
    if (!token || token.type === 'NEWLINE') return;

    if (token.value === 'index' && this.match('(')) {
      const fieldList: string[] = [];
      while (!this.isAtEnd() && !this.check(')')) {
        const field = this.consume('IDENT', "Expected field name in index");
        fieldList.push(field.value);
        this.match(','); // Optional comma
      }
      this.match(')');
      clazz.indexes = clazz.indexes || [];
      clazz.indexes.push({ fields: fieldList });
      return;
    }

    if (token.value === 'partition' && this.match('(')) {
      const type = this.advance().value || 'HASH';
      this.match(',');
      const field = this.advance().value || 'id';
      this.match(')');
      clazz.partitionBy = { type, field };
      return;
    }

    // Attribute or Operation
    let visibility = "public";
    let name = "";

    if (token.type === 'OP' && (token.value === '+' || token.value === '-')) {
      visibility = token.value === '+' ? 'public' : 'private';
      name = this.sanitizeName(this.consume('IDENT', "Expected member name").value);
    } else if (token.type === 'IDENT') {
      name = this.sanitizeName(token.value);
    } else {
        return; // Ignore
    }

    if (this.check('(')) {
      // Operation
      this.match('(');
      while (!this.isAtEnd() && !this.check(')') && !this.checkType('NEWLINE')) this.advance();
      this.match(')');
      clazz.operations.push({ name, visibility });
    } else {
      // Attribute
      let typeName = 'unknown';
      if (this.match(':')) {
        typeName = this.advance().value;
      } else if (this.checkType('IDENT')) {
        typeName = this.advance().value;
      }

      const attr: any = {
        name,
        typeRef: { name: this.sanitizeName(typeName) },
        visibility
      };

      // Modifiers
      while (!this.isAtEnd() && !this.checkType('NEWLINE') && !this.check('}')) {
        const token = this.advance();
        const mod = token.value;
        const lowerMod = mod.toLowerCase();

        if (mod === '[' || mod === ']') continue;

        if (lowerMod === 'primary' || mod === 'PK') { attr.primary = true; }
        else if (lowerMod === 'unique') { attr.unique = true; }
        else if (lowerMod === 'index') { attr.index = true; }
        else if (mod === 'FK') { 
            if (!attr.references) attr.references = { entity: "Pending", field: "id" };
        }
        else if (lowerMod === 'references') {
          const refStr = this.advance().value;
          if (refStr.includes('.')) {
            const [e, f] = refStr.split('.');
            attr.references = { entity: e, field: f };
          } else {
            attr.references = { entity: refStr, field: 'id' };
          }
        } else {
          break; // Stop at unknown modifier or next line
        }
      }
      clazz.attributes.push(attr);
    }
  }

  private parseComponent() {
    this.currentKind = "component";
    let name = "Unnamed";
    if (this.checkType('STRING') || this.checkType('IDENT')) {
        name = this.advance().value;
    }
    
    let id = this.sanitizeName(name);
    if (this.match('as')) {
        id = this.sanitizeName(this.consume('IDENT', "Expected alias").value);
    }

    const comp: any = {
      id,
      type: "component",
      name: this.sanitizeName(name),
      ports: [],
      contains: []
    };

    if (this.match('{')) {
      while (!this.isAtEnd() && !this.check('}')) {
        const token = this.advance();
        if (token.type === 'NEWLINE') continue;
        if (token.value === 'provides' || token.value === 'requires') {
          const direction = token.value;
          const portName = this.sanitizeName(this.consume('IDENT', "Expected port name").value);
          let ifaceId = undefined;
          if (this.match(':')) ifaceId = this.sanitizeName(this.advance().value);
          comp.ports.push({ name: portName, direction, interface: ifaceId });
        }
        this.syncToNextLine();
      }
      this.match('}');
    }
    this.currentElements.push(comp);
  }

  private parseParticipant() {
    this.currentKind = "sequence";
    const name = this.consume('IDENT', "Expected participant name").value;
    let id = this.sanitizeName(name);
    if (this.match('as')) {
      id = this.sanitizeName(this.consume('IDENT', "Expected alias").value);
    }
    this.currentElements.push({ id, type: "participant", name: this.sanitizeName(name), role: "component" });
  }

  private parseRelationship() {
    const fromId = this.sanitizeName(this.advance().value);
    let fromMultiplicity: string | undefined = undefined;
    let toMultiplicity: string | undefined = undefined;

    // Check for multiplicity before operator: A "1" -- B
    if (this.checkType('STRING')) {
        fromMultiplicity = this.advance().value;
    }

    const opToken = this.consume('OP', "Expected relationship operator");
    
    // Check for multiplicity after operator: A -- "*" B
    if (this.checkType('STRING')) {
        toMultiplicity = this.advance().value;
    }

    const toId = this.sanitizeName(this.consume('IDENT', "Expected target of relationship").value);

    let type = "association";
    let kind = "sync";
    let navigability: "none" | "from-to" | "to-from" | "both" = "none";
    const op = opToken.value;

    if (op.includes('..>')) {
        type = "dependency";
        navigability = "from-to";
    }
    else if (op === '-->') { 
        navigability = "from-to";
        if (this.currentKind === "sequence") {
            type = "message";
            kind = "reply";
        } else {
            type = "association";
        }
    }
    else if (op === '->') { 
        navigability = "from-to";
        if (this.currentKind === "sequence") {
            type = "message";
            kind = "sync";
        } else {
            type = "association";
        }
    }
    else if (op === '<--') {
        navigability = "to-from";
        type = "association";
    }
    else if (op === '<-->') {
        navigability = "both";
        type = "association";
    }
    else if (op === '--') {
        navigability = "none";
        type = "association";
    }
    else if (op === '*--') type = "composition";
    else if (op === 'o--') type = "aggregation";

    if (type === 'message') this.currentKind = "sequence";

    const rel: any = {
      id: generateId(),
      from: fromId, 
      to: toId, 
      type, 
      label: "",
      fromMultiplicity,
      toMultiplicity,
      navigability
    };
    if (type === 'message') rel.kind = kind;

    if (this.match(':')) {
      let label = "";
      while (!this.isAtEnd() && !this.checkType('NEWLINE') && !this.checkType('OP') && !this.check('{')) {
        label += this.advance().value + " ";
      }
      rel.label = label.trim();
    }
    this.currentRelationships.push(rel);
  }

  // --- Parsing Helpers ---

  private isRelationshipStart(): boolean {
    const t1 = this.peek();
    if (!t1 || (t1.type !== 'IDENT' && t1.type !== 'STRING')) return false;

    // Direct match: A -- B
    const t2 = this.peek(1);
    if (t2?.type === 'OP' && (t2.value.includes('--') || t2.value.includes('->') || t2.value.includes('..>'))) return true;

    // Cardinality match: A "1" -- B
    const t3 = this.peek(2);
    if (t1.type === 'IDENT' && t2?.type === 'STRING' && t3?.type === 'OP' && (t3.value.includes('--') || t3.value.includes('->'))) return true;

    return false;
  }

  private match(...values: string[]): boolean {
    for (const val of values) {
      if (this.check(val)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(value: string): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().value === value;
  }

  private checkType(type: string): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private consume(type: string, message: string): Token {
    if (this.checkType(type)) return this.advance();
    throw new Error(message);
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.tokens[this.current - 1];
  }

  private peek(offset = 0): Token {
    return this.tokens[this.current + offset];
  }

  private isAtEnd(): boolean {
    return this.current >= this.tokens.length;
  }

  private syncToNextLine() {
    while (!this.isAtEnd() && !this.checkType('NEWLINE')) this.advance();
  }

  // --- Utility ---

  private sanitizeName(name: string): string {
    if (!name) return "unknown";
    let sanitized = name.split(/[\s-]+/)
      .map((word, index) => {
        const cleaned = word.replace(/[^a-zA-Z0-9_]/g, '');
        if (!cleaned) return '';
        if (index === 0) return cleaned;
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }).join('');

    sanitized = sanitized.replace(/[^a-zA-Z0-9_]/g, '');
    if (!/^[a-zA-Z_]/.test(sanitized)) sanitized = 'f_' + sanitized;
    return sanitized || "unknown";
  }

  private tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let cur = 0;
    let line = 1;
    let col = 1;
    const operators = ["-->", "->", "<--", "<-", "o--", "*--", "..>", "<..", "<|--", "--", ":", "{", "}", "(", ")", "[", "]", ",", "+", "-", "#", "="];

    while (cur < input.length) {
      let char = input[cur];
      if (char === ' ' || char === '\t') { cur++; col++; continue; }
      if (char === '\n') {
        cur++; line++; col = 1;
        tokens.push({ type: 'NEWLINE', value: '\n', line, col });
        continue;
      }
      if ((char === '/' && input[cur + 1] === '/') || char === '#') {
        while (cur < input.length && input[cur] !== '\n') cur++;
        continue;
      }
      if (char === '"') {
        let value = "";
        const startCol = col;
        cur++; col++;
        while (cur < input.length && input[cur] !== '"') {
          if (input[cur] === '\\') { cur++; col++; }
          value += input[cur]; cur++; col++;
        }
        cur++; col++;
        tokens.push({ type: 'STRING', value, line, col: startCol });
        continue;
      }

      let matchedOp = "";
      for (const op of operators) {
        if (input.startsWith(op, cur)) { matchedOp = op; break; }
      }
      if (matchedOp) {
        tokens.push({ type: 'OP', value: matchedOp, line, col });
        cur += matchedOp.length; col += matchedOp.length;
        continue;
      }

      const alphaNumeric = /[a-zA-Z0-9_\-.]/;
      if (alphaNumeric.test(char)) {
        let value = "";
        const startCol = col;
        while (cur < input.length && alphaNumeric.test(input[cur])) {
          value += input[cur]; cur++; col++;
        }
        tokens.push({ type: 'IDENT', value, line, col: startCol });
        continue;
      }
      cur++; col++;
    }
    return tokens;
  }

  private calculateFingerprint(ir: DiagramIR): string {
    const contentToHash = JSON.stringify({
      version: ir.version,
      sourceText: ir.source?.text || "",
      diagramCount: ir.diagrams.length,
      diagramIds: ir.diagrams.map(d => d.id)
    });
    return createHash('sha256').update(contentToHash).digest('hex');
  }

  private error(message: string, token: Token | null) {
    const diag: Diagnostic = { severity: "error", message };
    if (token) {
      diag.span = {
        startLine: token.line, startCol: token.col,
        endLine: token.line, endCol: token.col + token.value.length
      };
    }
    this.diagnostics.push(diag);
  }
}
