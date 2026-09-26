export type ChangeKind = 
  | "create-file" 
  | "update-file" 
  | "delete-file" 
  | "update-slot" 
  | "merge-json"
  | "ensure-import";

export interface ChangeOperation {
  id: string;
  capsuleId: string;
  kind: ChangeKind;
  target: string; // File path or slot locator
  payload: any;
  dependsOn?: string[];
  semanticKey?: string; // e.g. "symbol:BookingModule"
  slotId?: string;       // e.g. "nestjs:AppModule.imports"
  metadata?: Record<string, any>;
}

export interface ExecutionResult {
  operationId: string;
  success: boolean;
  error?: string;
  warning?: string;
  durationMs: number;
}
