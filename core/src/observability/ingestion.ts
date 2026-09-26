import * as fs from 'fs-extra';
import * as path from 'path';
import * as readline from 'readline';
import { TraceModel, SpanModel, EventModel, ArtifactLineage } from './models';
import { EventType, EventCategory } from '../core/telemetry/telemetry-schema';
import { TraceIntelligenceEngine } from './intelligence';

export class IngestionService {
    private traces: Map<string, TraceModel> = new Map();
    private lineage: Map<string, ArtifactLineage> = new Map();
    private plans: Map<string, any> = new Map();
    private processedEvents: Set<string> = new Set();

    private telemetrySources: string[] = [];
    private onUpdate?: () => void;

    constructor(workspaceRoot: string) {
        this.addSource(workspaceRoot);
        // Automatically check for remote server telemetry in standard project structure
        const remotePath = path.join(workspaceRoot, 'servers', 'remote');
        if (fs.existsSync(remotePath)) {
            this.addSource(remotePath);
        }
    }

    addSource(root: string) {
        if (!this.telemetrySources.includes(root)) {
            this.telemetrySources.push(root);
            this.watchSource(root);
        }
    }

    private watchSource(root: string) {
        const archonDir = path.join(root, '.archon');
        
        // Watch for changes in the entire .archon directory recursively
        if (fs.existsSync(archonDir)) {
            fs.watch(archonDir, { recursive: true }, (event, filename) => {
                if (filename && (filename.endsWith('.jsonl') || filename.endsWith('.json'))) {
                    this.sync().then(() => this.onUpdate?.());
                }
            });
        } else {
            // Watch the root for the creation of .archon folder
            fs.watch(root, (event, filename) => {
                if (filename === '.archon' && event === 'rename') {
                    this.sync().then(() => this.onUpdate?.());
                    this.watchSource(root); // Re-run to watch the newly created telemetry folder
                }
            });
        }
    }

    setUpdateCallback(cb: () => void) {
        this.onUpdate = cb;
    }

    async updateWorkspaceRoot(newRoot: string) {
        this.telemetrySources = [newRoot];
        const remotePath = path.join(newRoot, 'servers', 'remote');
        if (fs.existsSync(remotePath)) {
            this.telemetrySources.push(remotePath);
        }
        
        this.traces.clear();
        this.lineage.clear();
        this.plans.clear();
        this.processedEvents.clear();
        
        this.telemetrySources.forEach(s => this.watchSource(s));
        await this.sync();
    }


    async sync(): Promise<void> {
        const archonPaths = await this.getArchonPaths();
        await this.syncTelemetry(archonPaths);
        await this.syncState(archonPaths);
        await this.syncRuntimeLogs(archonPaths);
        await this.syncPlans(archonPaths);
    }

    private async getArchonPaths(): Promise<string[]> {
        const paths: string[] = [];
        for (const source of this.telemetrySources) {
            const archonDir = path.join(source, '.archon');
            if (await fs.pathExists(archonDir)) {
                // 1. Root/Legacy path
                paths.push(archonDir);
                
                // 2. Global path
                const globalDir = path.join(archonDir, 'global');
                if (await fs.pathExists(globalDir)) paths.push(globalDir);
                
                // 3. Project paths
                const projectsDir = path.join(archonDir, 'projects');
                if (await fs.pathExists(projectsDir)) {
                    const projects = await fs.readdir(projectsDir);
                    for (const project of projects) {
                        const projectDir = path.join(projectsDir, project);
                        if ((await fs.stat(projectDir)).isDirectory()) {
                            paths.push(projectDir);
                        }
                    }
                }
            }
        }


        return Array.from(new Set(paths)); // Deduplicate
    }

    private async syncTelemetry(archonPaths: string[]): Promise<void> {
        for (const archonPath of archonPaths) {
            const telemetryPath = path.join(archonPath, 'telemetry.jsonl');
            if (!await fs.pathExists(telemetryPath)) continue;

            const fileStream = fs.createReadStream(telemetryPath);
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });

            for await (const line of rl) {
                if (!line.trim()) continue;
                try {
                    const event = JSON.parse(line);
                    if (event.eventId && this.processedEvents.has(event.eventId)) continue;
                    if (event.eventId) this.processedEvents.add(event.eventId);
                    
                    this.ingestEvent(event);
                } catch (err) {
                    console.error('[Ingestion] Failed to parse telemetry line:', err);
                }
            }
        }
    }

    private async syncRuntimeLogs(archonPaths: string[]): Promise<void> {
        for (const archonPath of archonPaths) {
            const runtimeLogPath = path.join(archonPath, 'runtime.jsonl');
            if (!await fs.pathExists(runtimeLogPath)) continue;

            const fileStream = fs.createReadStream(runtimeLogPath);
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });

            for await (const line of rl) {
                if (!line.trim()) continue;
                try {
                    const log = JSON.parse(line);
                    this.ingestRuntimeLog(log);
                } catch (err) {
                    console.error('[Ingestion] Failed to parse runtime log line:', err);
                }
            }
        }
    }

    private ingestRuntimeLog(log: any) {
        const { reqId, msg, level, time, res, req } = log;
        const traceId = reqId || log.traceId;

        if (!traceId) return;

        let trace = this.traces.get(traceId);
        if (!trace) {
            trace = {
                traceId,
                startTime: new Date(time || Date.now()).toISOString(),
                status: 'IN_PROGRESS',
                actorId: 'runtime-client',
                spans: []
            };
            this.traces.set(traceId, trace);
        }

        let runtimeSpan = trace.spans.find(s => s.operation === 'runtime_request');
        if (!runtimeSpan) {
            runtimeSpan = {
                spanId: `rt-${traceId.substring(0, 8)}`,
                traceId,
                operation: 'runtime_request',
                startTime: new Date(time || Date.now()).toISOString(),
                status: 'IN_PROGRESS',
                category: 'runtime',
                metadata: { method: req?.method, url: req?.url },
                events: []
            };
            trace.spans.push(runtimeSpan);
        }

        runtimeSpan.events.push({
            eventId: `log-${Math.random().toString(36).substring(2, 8)}`,
            timestamp: new Date(time || Date.now()).toISOString(),
            eventType: 'RUNTIME_LOG',
            severity: this.mapPinoLevel(level),
            message: msg,
            metadata: { ...log }
        });

        if (res) {
            runtimeSpan.endTime = new Date(time || Date.now()).toISOString();
            runtimeSpan.status = res.statusCode < 400 ? 'SUCCESS' : 'FAILED';
            runtimeSpan.metadata.statusCode = res.statusCode;
        }
    }


    private async syncState(archonPaths: string[]): Promise<void> {
        for (const archonPath of archonPaths) {
            const statePath = path.join(archonPath, 'state.json');
            if (!await fs.pathExists(statePath)) continue;

            try {
                const state = await fs.readJson(statePath);
                if (state.ownedArtifacts) {
                    for (const [path, entry] of Object.entries(state.ownedArtifacts as any)) {
                        let lin = this.lineage.get(path);
                        if (!lin) {
                            lin = { path, history: [], owningCapsuleId: (entry as any).capsuleId };
                            this.lineage.set(path, lin);
                        }
                    }
                }
            } catch (err) {
                console.error('[Ingestion] Failed to sync state:', err);
            }
        }
    }

    private async syncPlans(archonPaths: string[]): Promise<void> {
        for (const archonPath of archonPaths) {
            const plansDir = path.join(archonPath, 'plans');
            if (!await fs.pathExists(plansDir)) continue;

            const files = await fs.readdir(plansDir);
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                const planId = file.replace('.json', '');
                if (this.plans.has(planId)) continue;

                try {
                    const plan = await fs.readJson(path.join(plansDir, file));
                    this.plans.set(planId, plan);
                } catch (err) {
                    console.error(`[Ingestion] Failed to parse plan ${file}:`, err);
                }
            }
        }
    }


    private mapPinoLevel(level: number): string {
        if (level >= 50) return 'ERROR';
        if (level >= 40) return 'WARN';
        return 'INFO';
    }

    private ingestEvent(raw: any) {
        const { 
            traceId, spanId, parentSpanId, eventType, timestamp, 
            severity, metadata, operation, eventCategory, status, 
            durationMs, planId, projectName, serverName, toolCategory 
        } = raw;
        
        const category = eventCategory || raw.category || 'unknown';
        
        if (!traceId) return;

        let trace = this.traces.get(traceId);
        if (!trace) {
            trace = {
                traceId,
                startTime: timestamp,
                status: 'IN_PROGRESS',
                workspaceId: raw.workspaceId,
                actorId: raw.actorId,
                projectName: projectName || 'Default Project',
                spans: []
            };
            this.traces.set(traceId, trace);
        }

        // --- OUTCOME PROCESSING ---
        if (eventType === 'OUTCOME_SUCCESS') {
            trace.outcome = { status: 'VERIFIED' };
        } else if (eventType === 'OUTCOME_FAILED') {
            trace.outcome = { status: 'FAILED', reason: metadata?.reason };
        } else if (eventType === 'OUTCOME_EVALUATED') {
            if (!trace.outcome) trace.outcome = { status: 'PENDING' };
        }

        if (eventType === 'ORCHESTRATION_COMPLETED') {
            trace.status = 'SUCCESS';
            trace.endTime = timestamp;
            if (trace.startTime && trace.endTime) {
                trace.durationMs = new Date(trace.endTime).getTime() - new Date(trace.startTime).getTime();
            }
        } else if (eventType === 'ORCHESTRATION_FAILED') {
            trace.status = 'FAILED';
            trace.endTime = timestamp;
            if (trace.startTime && trace.endTime) {
                trace.durationMs = new Date(trace.endTime).getTime() - new Date(trace.startTime).getTime();
            }
        } else if (eventType === 'ORCHESTRATION_STARTED') {
            trace.status = 'IN_PROGRESS';
            trace.startTime = timestamp;
        }

        if (planId) {
            trace.metadata = { ...trace.metadata, planId };
        }

        if (projectName && !trace.projectName) {
            trace.projectName = projectName;
        }

        if (spanId) {
            let span = trace.spans.find(s => s.spanId === spanId);
            if (!span) {
                span = {
                    spanId,
                    parentSpanId,
                    traceId,
                    operation: operation || 'unknown',
                    startTime: timestamp,
                    status: 'IN_PROGRESS',
                    category: category || 'unknown',
                    serverName: serverName,
                    toolCategory: toolCategory,
                    metadata: metadata || {},
                    events: []
                };
                trace.spans.push(span);
            }

            if (serverName && !span.serverName) span.serverName = serverName;
            if (toolCategory && !span.toolCategory) span.toolCategory = toolCategory;

            const isCompletion = eventType.endsWith('_COMPLETED') || eventType.endsWith('_FAILED') || eventType.endsWith('_REJECTED');
            if (isCompletion) {
                span.endTime = timestamp;
                span.durationMs = durationMs;
                span.status = (status === 'SUCCESS' || status === 'APPLIED') ? 'SUCCESS' : 'FAILED';
                // Merge completion metadata (like output or error)
                if (metadata) {
                    span.metadata = { ...span.metadata, ...metadata };
                }
                if (raw.reason && !span.metadata.error) {
                    span.metadata.error = raw.reason;
                }
            }

            const isMutationEvent = eventType.endsWith('_COMPLETED') || eventType === 'PLAN_APPLIED' || eventType === 'MATERIALIZATION_COMPLETED';
            if (isMutationEvent) {
                if (metadata?.path) {
                    this.recordLineage(metadata.path, traceId, planId, eventType, trace.projectName);
                }
                if (metadata?.paths && Array.isArray(metadata.paths)) {
                    const uniquePaths = Array.from(new Set(metadata.paths as string[]));
                    for (const p of uniquePaths) {
                        this.recordLineage(p, traceId, planId, eventType, trace.projectName);
                    }
                }
            }

            span.events.push({
                eventId: raw.eventId || Math.random().toString(36).substring(2, 10),
                timestamp,
                eventType,
                severity,
                metadata: metadata || {}
            });
        }
    }

    private recordLineage(artifactPath: string, traceId: string, planId: string, eventType: string, projectName?: string) {
        let lin = this.lineage.get(artifactPath);
        if (!lin) {
            lin = { path: artifactPath, history: [], projectName: projectName || 'Default Project' };
            this.lineage.set(artifactPath, lin);
        }

        const type = eventType.includes('create') ? 'create' : (eventType.includes('delete') ? 'delete' : 'update');
        
        const isDuplicate = lin.history.some(h => 
            h.traceId === traceId && (h.planId === planId || (!h.planId && !planId))
        );
        
        if (!isDuplicate) {
            lin.history.push({
                timestamp: new Date().toISOString(),
                traceId,
                planId,
                type: type as any
            });
            lin.lastTraceId = traceId;
            lin.lastPlanId = planId;
        }
    }

    getTraces(): TraceModel[] {
        return Array.from(this.traces.values()).sort((a, b) => 
            new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        );
    }

    getTrace(traceId: string): TraceModel | undefined {
        const trace = this.traces.get(traceId);
        if (trace) {
            if (!trace.durationMs && trace.spans.length > 0) {
                const starts = trace.spans.map(s => new Date(s.startTime).getTime());
                const ends = trace.spans.map(s => s.endTime ? new Date(s.endTime).getTime() : new Date().getTime());
                const min = Math.min(...starts);
                const max = Math.max(...ends);
                trace.durationMs = max - min;
            }
            
            trace.insights = TraceIntelligenceEngine.analyze(trace);
        }
        return trace;
    }

    getLineage(): ArtifactLineage[] {
        return Array.from(this.lineage.values());
    }

    getArtifactHistory(artifactPath: string): ArtifactLineage | undefined {
        return this.lineage.get(artifactPath);
    }

    getPlans(): any[] {
        return Array.from(this.plans.values()).sort((a, b) => 
            new Date(b.metadata.generatedAt).getTime() - new Date(a.metadata.generatedAt).getTime()
        );
    }

    getPlan(planId: string): any | undefined {
        return this.plans.get(planId);
    }

    async cleanup(projectName?: string): Promise<void> {
        for (const source of this.telemetrySources) {
            const archonDir = path.join(source, '.archon');
            if (!await fs.pathExists(archonDir)) continue;

            if (projectName) {
                const projectDir = path.join(archonDir, 'projects', projectName);
                if (await fs.pathExists(projectDir)) {
                    await fs.remove(projectDir);
                }
                
                // Handle Default Project legacy files AND global folder
                if (projectName === 'Default Project' || projectName === 'default') {
                    const legacyFiles = ['telemetry.jsonl', 'runtime.jsonl', 'lineage.jsonl', 'state.json', 'plans', 'missions'];
                    for (const file of legacyFiles) {
                        const p = path.join(archonDir, file);
                        if (await fs.pathExists(p)) await fs.remove(p);
                    }
                    
                    const globalDir = path.join(archonDir, 'global');
                    if (await fs.pathExists(globalDir)) {
                        await fs.remove(globalDir);
                    }
                }

            } else {
                // Global cleanup
                const projectsDir = path.join(archonDir, 'projects');
                const globalDir = path.join(archonDir, 'global');
                if (await fs.pathExists(projectsDir)) await fs.remove(projectsDir);
                if (await fs.pathExists(globalDir)) await fs.remove(globalDir);
                
                const legacyFiles = ['telemetry.jsonl', 'runtime.jsonl', 'lineage.jsonl', 'state.json', 'plans', 'missions'];
                for (const file of legacyFiles) {
                    const p = path.join(archonDir, file);
                    if (await fs.pathExists(p)) await fs.remove(p);
                }
            }
        }
        
        // Refresh state
        this.traces.clear();
        this.lineage.clear();
        this.plans.clear();
        this.processedEvents.clear();
        await this.sync();
    }
}

