import { z } from 'zod';

export const IdSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_\-:.]*$/, "Invalid ID format");
export const RefSchema = IdSchema;

export const PositionSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().optional(),
  h: z.number().optional(),
});

export const SourceSpanSchema = z.object({
  startLine: z.number().min(1),
  startCol: z.number().min(1),
  endLine: z.number().min(1),
  endCol: z.number().min(1),
});

export const TaggedValueSchema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  namespace: z.string().optional(),
});

export const DocumentationSchema = z.object({
  summary: z.string().optional(),
  details: z.string().optional(),
  examples: z.array(z.string()).optional(),
});

export const DiagnosticSchema = z.object({
  severity: z.enum(["info", "warning", "error"]),
  code: z.string().optional(),
  message: z.string(),
  path: z.string().optional(),
  span: SourceSpanSchema.optional(),
});

export const ElementBaseSchema = z.object({
  id: IdSchema,
  type: z.string(),
  name: z.string().min(1),
  stereotypes: z.array(z.string()).optional(),
  tags: z.array(TaggedValueSchema).optional(),
  doc: DocumentationSchema.optional(),
  position: PositionSchema.optional(),
  span: SourceSpanSchema.optional(),
});

export const VisibilitySchema = z.enum(["public", "protected", "private", "package"]);

export const TypeRefSchema: z.ZodType<any> = z.lazy(() => z.object({
  name: z.string().min(1),
  genericArgs: z.array(TypeRefSchema).optional(),
  nullable: z.boolean().optional(),
  isArray: z.boolean().optional(),
  refId: IdSchema.optional(),
}));

export const AttributeSchema = z.object({
  name: z.string().min(1),
  visibility: VisibilitySchema.optional(),
  typeRef: TypeRefSchema,
  static: z.boolean().optional(),
  readonly: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  doc: DocumentationSchema.optional(),
  tags: z.array(TaggedValueSchema).optional(),
  span: SourceSpanSchema.optional(),
  unique: z.boolean().optional(),
  references: z.object({ entity: z.string(), field: z.string() }).optional(),
  index: z.boolean().optional(),
});

export const ParameterSchema = z.object({
  name: z.string().min(1),
  typeRef: TypeRefSchema,
  default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  doc: DocumentationSchema.optional(),
});

export const OperationSchema = z.object({
  name: z.string().min(1),
  visibility: VisibilitySchema.optional(),
  params: z.array(ParameterSchema).optional(),
  returns: TypeRefSchema.optional(),
  static: z.boolean().optional(),
  abstract: z.boolean().optional(),
  doc: DocumentationSchema.optional(),
  tags: z.array(TaggedValueSchema).optional(),
  span: SourceSpanSchema.optional(),
});

export const ClassSchema = ElementBaseSchema.extend({
  type: z.literal("classifier"),
  kind: z.enum(["class", "abstract", "interface", "enum", "valueobject"]),
  attributes: z.array(AttributeSchema).optional(),
  operations: z.array(OperationSchema).optional(),
  extends: z.array(IdSchema).optional(),
  implements: z.array(IdSchema).optional(),
  indexes: z.array(z.object({ name: z.string().optional(), fields: z.array(z.string()), unique: z.boolean().optional() })).optional(),
  partitionBy: z.object({ type: z.enum(['LIST', 'RANGE', 'HASH']), field: z.string() }).optional(),
});

export const PortSchema = z.object({
  name: z.string().min(1),
  direction: z.enum(["provides", "requires"]),
  interface: IdSchema.optional(),
  doc: DocumentationSchema.optional(),
});

export const ComponentSchema = ElementBaseSchema.extend({
  type: z.literal("component"),
  ports: z.array(PortSchema).optional(),
  contains: z.array(IdSchema).optional(),
});

export const ServiceSchema = ElementBaseSchema.extend({
  type: z.literal("service"),
  entity: z.string().optional(),
});

export const EnumLiteralSchema = z.object({
  name: z.string().min(1),
  value: z.union([z.string(), z.number(), z.null()]).optional(),
  doc: DocumentationSchema.optional(),
});

export const MultiplicitySchema = z.string().regex(/^(\*|\d+)(\.\.(\*|\d+))?$/, "Invalid multiplicity");

export const RelationshipSchema = z.object({
  id: IdSchema,
  type: z.enum([
    "association",
    "aggregation",
    "composition",
    "dependency",
    "realization",
    "generalization",
    "usecase-association",
    "include",
    "extend",
    "message"
  ]),
  from: IdSchema,
  to: IdSchema,
  label: z.string().optional(),
  fromMultiplicity: MultiplicitySchema.optional(),
  toMultiplicity: MultiplicitySchema.optional(),
  navigability: z.enum(["none", "from-to", "to-from", "both"]).optional(),
  kind: z.enum(["sync", "async", "reply", "create", "destroy"]).optional(), // for messages
  span: SourceSpanSchema.optional(),
  tags: z.array(TaggedValueSchema).optional(),
});

export const ActorSchema = ElementBaseSchema.extend({
  type: z.literal("actor"),
});

export const UseCaseSchema = ElementBaseSchema.extend({
  type: z.literal("usecase"),
});

export const InterfaceSchema = ElementBaseSchema.extend({
  type: z.literal("interface"),
  operations: z.array(OperationSchema).optional(),
});

export const ParticipantSchema = ElementBaseSchema.extend({
  type: z.literal("participant"),
  role: z.enum(["actor", "boundary", "control", "entity", "service", "component", "database", "queue", "external"]).optional(),
  classifier: IdSchema.optional(),
});

export const MessageSchema = z.object({
  id: IdSchema,
  from: IdSchema,
  to: IdSchema,
  kind: z.enum(["sync", "async", "reply", "create", "destroy"]),
  label: z.string().optional(),
  sequence: z.number().int().min(1).optional(),
  span: SourceSpanSchema.optional(),
  tags: z.array(TaggedValueSchema).optional(),
});

export const FragmentSchema = z.object({
  kind: z.enum(["alt", "opt", "loop", "par", "break", "critical"]),
  condition: z.string().optional(),
  start: z.number().int().min(1),
  end: z.number().int().min(1),
  span: SourceSpanSchema.optional(),
});

export const DiagramSchema = z.object({
  id: IdSchema,
  kind: z.enum(["usecase", "class", "component", "sequence"]),
  name: z.string().min(1),
  key: z.string().optional(),
  doc: DocumentationSchema.optional(),
  elements: z.array(z.union([
    ActorSchema,
    UseCaseSchema,
    ClassSchema,
    ComponentSchema,
    InterfaceSchema,
    ParticipantSchema,
    ServiceSchema
  ])),
  relationships: z.array(RelationshipSchema),
  fragments: z.array(FragmentSchema).optional(),
});

export const DiagramIRSchema = z.object({
  version: z.literal("1.0.0"),
  source: z.object({
    kind: z.enum(["ascii-dsl", "image", "other"]).optional(),
    uri: z.string().optional(),
    text: z.string().optional(),
    hash: z.string().optional(),
    createdAt: z.string().datetime().optional(),
  }).optional(),
  diagrams: z.array(DiagramSchema).min(1),
  fingerprint: z.string().optional(),
  warnings: z.array(DiagnosticSchema).optional(),
});

export type DiagramIR = z.infer<typeof DiagramIRSchema>;
