import { ExecutionContext } from '../core/engine/execution-context';
import { RuleResult } from './rule-result';

export type RulePhase = "scaffold" | "merge" | "validate";

export interface ArchonRule {
  id: string;
  description: string;
  phase: RulePhase;
  /**
   * Topological layer WITHIN a phase (lower runs first). Encodes the artifact
   * dependency lattice (entities → dtos → services → controllers → modules) so
   * intra-phase ordering is intentional and dependency-aligned rather than an
   * alphabetical accident. Defaults to 0. Rules in the same layer are mutually
   * independent (distinct outputs) — the unit a future parallel executor batches.
   */
  layer?: number;
  applies(ctx: ExecutionContext): boolean;
  apply(ctx: ExecutionContext): Promise<RuleResult>;
}
