import { VirtualTree } from '../vfs/vfs';
import { TemplateEngine } from '../vfs/template-engine';
import { AstEditor } from '../vfs/ast-editor';
import { Logger } from 'pino';
import { logger } from '../telemetry/logger';
import { ArchonState } from '../state/state-manager';

import { TraceContext } from '../telemetry/trace-context';

export interface ArchonSpec {
  [key: string]: any;
}

export interface ExecutionContext {
  spec: ArchonSpec;
  vfs: VirtualTree;
  template: TemplateEngine;
  ast: AstEditor;
  mode: "plan" | "apply";
  force: boolean;
  logger: Logger;
  trace: TraceContext;
  initialState?: ArchonState;
}

// We also export a helper to build the context
export function createExecutionContext(
  spec: ArchonSpec,
  vfs: VirtualTree,
  template: TemplateEngine,
  ast: AstEditor,
  mode: "plan" | "apply",
  trace: TraceContext,
  force: boolean = false,
  initialState?: ArchonState
): ExecutionContext {
  return { spec, vfs, template, ast, mode, force, logger, trace, initialState };
}
