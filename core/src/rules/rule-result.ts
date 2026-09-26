export interface PlannedChange {
  type: "create" | "update" | "delete";
  path: string;
  summary: string;
}

export interface RuleResult {
  ruleId: string;
  status: "applied" | "skipped" | "no-op" | "failed";
  changes: PlannedChange[];
  warnings?: string[];
  error?: string;
}
