import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getTraces: () => ipcRenderer.invoke('get-traces'),
  getTrace: (traceId: string) => ipcRenderer.invoke('get-trace', traceId),
  getArtifactHistory: (path: string) => ipcRenderer.invoke('get-artifact-history', path),
  getAllLineage: () => ipcRenderer.invoke('get-all-lineage'),
  getPlans: () => ipcRenderer.invoke('get-plans'),
  getPlan: (planId: string) => ipcRenderer.invoke('get-plan', planId),
  getSystemIntelligence: () => ipcRenderer.invoke('get-system-intelligence'),
  runMission: (specPath?: string) => ipcRenderer.invoke('run-mission', specPath),
  openSpecFile: () => ipcRenderer.invoke('open-spec-file'),
  activateMcpInspector: (serverCmd: string, args: string[]) => ipcRenderer.invoke('activate-mcp-inspector', serverCmd, args),
  stopMcpInspector: () => ipcRenderer.invoke('stop-mcp-inspector'),
  onInspectorUrl: (callback: (url: string) => void) => ipcRenderer.on('inspector-url', (_event, url) => callback(url)),
  onTraceUpdate: (callback: (data: any) => void) => ipcRenderer.on('trace-update', (_event, value) => callback(value)),
  getWorkspaceRoot: () => ipcRenderer.invoke('get-workspace-root'),
  setWorkspaceRoot: () => ipcRenderer.invoke('set-workspace-root'),
  cleanupData: (projectName?: string) => ipcRenderer.invoke('cleanup-data', projectName),
  callMcpTool: (serverCmd: string, args: string[], toolName: string, toolArgs: any) => ipcRenderer.invoke('call-mcp-tool', serverCmd, args, toolName, toolArgs),
})

contextBridge.exposeInMainWorld('ipcRenderer', {
  on: (channel: string, func: (...args: any[]) => void) => ipcRenderer.on(channel, (event, ...args) => func(event, ...args)),
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
})
