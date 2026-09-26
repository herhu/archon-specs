export interface GenerationContext {
  hasRedis: boolean;
  hasQueue: boolean;
  injectedModules: { className: string; importPath: string }[];
  projectName: string;
  apiPrefix: string;
}

export interface LineageManifest {
  lineageVersion: string;
  projectId: string;
  revisionId: string;
  lineageId: string;
  generatorVersion: string;
  templateSetVersion: string;
  specHash: string;
  templatesHash: string;
  generatedAt: string;
  metadata: {
    specName: string;
    targetDir: string;
    platform?: string;
  };
}
