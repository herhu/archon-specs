import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import * as fs from 'fs-extra'
import { IngestionService } from '../../src/observability/ingestion'
import { ObservabilityQueryApi } from '../../src/observability/query-api'
import * as crypto from 'node:crypto'
import { spawn, execSync } from 'node:child_process'

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null
let inspectorProcess: any = null
let workspaceRoot = path.join(app.getAppPath(), '..') 
// If running in dashboard dev mode, we might be nested deeper
if (workspaceRoot.endsWith('dashboard')) {
  workspaceRoot = path.resolve(workspaceRoot, '..')
}
if (workspaceRoot.endsWith('archon')) {
  workspaceRoot = path.resolve(workspaceRoot, '..')
}
const archonBinPath = path.resolve(app.getAppPath(), '..', 'bin', 'archon.ts')
const ingestion = new IngestionService(workspaceRoot)
const queryApi = new ObservabilityQueryApi(ingestion)

ingestion.setUpdateCallback(() => {
  win?.webContents.send('trace-update', { type: 'TELEMETRY_SYNC' })
})

console.log('[Main] Starting Archon Mission Control v1.2.0');
console.log('[Main] App Path:', app.getAppPath());
console.log('[Main] Preload Path:', path.join(__dirname, 'preload.js'));
console.log('[Main] __dirname:', __dirname);

function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 840,
    title: 'Archon Mission Control',
    icon: path.join(process.env.VITE_PUBLIC!, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#0a0a0c',
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date()).toLocaleString())
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.DIST!, 'index.html'))
  }
}

// 📡 IPC Handlers
ipcMain.handle('get-traces', async () => {
  await ingestion.sync()
  return await queryApi.searchTraces({})
})

ipcMain.handle('get-trace', async (_, traceId: string) => {
  await ingestion.sync()
  return await queryApi.getTraceTimeline(traceId)
})

ipcMain.handle('get-artifact-history', async (_, path: string) => {
  await ingestion.sync()
  return await queryApi.getArtifactDeepDive(path)
})

ipcMain.handle('get-all-lineage', async () => {
  await ingestion.sync()
  return await queryApi.getAllLineage()
})

ipcMain.handle('get-plans', async () => {
  await ingestion.sync()
  return await queryApi.getPlans()
})

ipcMain.handle('get-plan', async (_, planId: string) => {
  await ingestion.sync()
  return await queryApi.getPlan(planId)
})

ipcMain.handle('get-system-intelligence', async () => {
  await ingestion.sync()
  return await queryApi.getSystemIntelligence()
})

ipcMain.handle('open-spec-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (canceled) return null
  return filePaths[0]
})

ipcMain.handle('get-workspace-root', async () => {
  return workspaceRoot
})

ipcMain.handle('set-workspace-root', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  if (canceled) return workspaceRoot
  
  workspaceRoot = filePaths[0]
  ingestion.updateWorkspaceRoot(workspaceRoot)
  return workspaceRoot
})

ipcMain.handle('cleanup-data', async (_, projectName?: string) => {
  console.log(`[Main] Cleanup requested for: ${projectName || 'GLOBAL'}`);
  await ingestion.cleanup(projectName);
  return true;
})




ipcMain.handle('run-mission', async (_, specPath?: string) => {
  let targetSpecPath = specPath
  
  if (!targetSpecPath) {
    // Try to discover spec
    const possibleSpecs = ['DesignSpec.json', 'designspec.json', 'spec.json']
    for (const s of possibleSpecs) {
      const p = path.join(workspaceRoot, s)
      if (await fs.pathExists(p)) {
        targetSpecPath = p
        break
      }
    }
  }

  if (!targetSpecPath || !await fs.pathExists(targetSpecPath)) {
    throw new Error(`Spec file not found in ${workspaceRoot}. Please ensure DesignSpec.json exists or select it manually.`)
  }

  const traceId = crypto.randomUUID()
  const outputDir = path.join(workspaceRoot, 'archon-output')

  console.log(`[Main] Launching Mission via Spawn: ${traceId}`);
  console.log(`[Main] Using CLI: ${archonBinPath}`);
  console.log(`[Main] Working Dir: ${workspaceRoot}`);
  
  const child = spawn('npx', [
    'ts-node', 
    archonBinPath, 
    'generate',
    '-s', targetSpecPath,
    '-o', outputDir,
    '--trace-id', traceId,
    '--force'
  ], {
    cwd: workspaceRoot,
    env: { ...process.env, ARCHON_TRACE_ID: traceId },
    shell: true
  });

  child.stdout.on('data', (data) => console.log(`[Orchestrator] ${data}`));
  child.stderr.on('data', (data) => console.error(`[Orchestrator Log] ${data}`));

  return new Promise((resolve) => {
    resolve(traceId);
  });
})

ipcMain.handle('activate-mcp-inspector', async (_, serverCmd: string, args: string[]) => {
  // Aggressive cleanup of ports used by the inspector
  try {
    console.log('[Main] Cleaning up inspector ports (5188, 6277, 6274)...');
    if (process.platform === 'darwin' || process.platform === 'linux') {
      execSync('lsof -ti :5188,6277,6274 | xargs kill -9 > /dev/null 2>&1 || true');
    }
  } catch (e) {}

  if (inspectorProcess) {
    try {
      process.kill(inspectorProcess.pid);
    } catch (e) {}
    inspectorProcess = null;
  }

  console.log(`[Main] Activating MCP Inspector for: ${serverCmd} ${args.join(' ')}`);
  
  // We specify a fixed port 5173 for the web UI
  inspectorProcess = spawn('npx', [
    '-y',
    '@modelcontextprotocol/inspector',
    serverCmd,
    ...args
  ], {
    cwd: workspaceRoot,
    env: { ...process.env, PORT: '5188' }, // Force to a non-conflicting port
    shell: true
  });

  inspectorProcess.stdout.on('data', (data: any) => {
    const output = data.toString();
    console.log(`[Inspector] ${output}`);
    
    // Look for the URL in the output
    const urlMatch = output.match(/http:\/\/localhost:\d+\/\?MCP_PROXY_AUTH_TOKEN=[a-f0-9]+/);
    if (urlMatch && win) {
      console.log(`[Main] Detected Inspector URL: ${urlMatch[0]}`);
      win.webContents.send('inspector-url', urlMatch[0]);
    }
  });

  inspectorProcess.stderr.on('data', (data: any) => console.error(`[Inspector Error] ${data}`));

  return new Promise((resolve) => {
    // Give it a moment to start
    setTimeout(() => resolve(true), 2000);
  });
})

ipcMain.handle('call-mcp-tool', async (_, serverCmd: string, args: string[], toolName: string, toolArgs: any) => {
  console.log(`[Main] Calling MCP Tool: ${toolName} on ${serverCmd} ${args.join(' ')}`);
  
  return new Promise((resolve, reject) => {
    const child = spawn(serverCmd, args, {
      cwd: workspaceRoot,
      shell: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      // Simple JSON-RPC response extraction
      try {
        const lines = stdout.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('{') && line.includes('"result"')) {
            resolve(JSON.parse(line));
            child.kill();
          }
        }
      } catch (e) {}
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      reject(err);
    });

    // Send the JSON-RPC request
    const request = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call", // FIX: MCP standard is tools/call
      params: {
        name: toolName,
        arguments: toolArgs
      }
    };

    child.stdin.write(JSON.stringify(request) + '\n');

    // Timeout after 30 seconds
    setTimeout(() => {
      child.kill();
      reject(new Error(`MCP Tool call timed out: ${stderr}`));
    }, 30000);
  });
})

ipcMain.handle('stop-mcp-inspector', async () => {
  // Aggressive cleanup
  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      execSync('lsof -ti :5188,6277,6274 | xargs kill -9 > /dev/null 2>&1 || true');
    }
  } catch (e) {}

  if (inspectorProcess) {
    try {
      process.kill(inspectorProcess.pid);
      inspectorProcess = null;
      return true;
    } catch (e) {
      return false;
    }
  }
  return true;
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)
