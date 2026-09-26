import React, { useState, useEffect, useRef } from 'react';
import { 
  Code, 
  Play, 
  FileJson, 
  Layout, 
  Terminal, 
  Shield, 
  Zap, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  Database,
  Cpu,
  Fingerprint,
  RefreshCw,
  Eye,
  Trash2,
  Box,
  Layers,
  ChevronRight,
  Search,
  Activity,
  Workflow,
  Sparkles,
  Maximize2,
  Network
} from 'lucide-react';

const Mermaid: React.FC<{ chart: string }> = ({ chart }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && chart && (window as any).mermaid) {
      (window as any).mermaid.initialize({ startOnLoad: true, theme: 'dark' });
      (window as any).mermaid.render('mermaid-svg-' + Math.random().toString(36).substr(2, 9), chart).then((res: any) => {
        if (ref.current) {
            ref.current.innerHTML = res.svg;
        }
      });
    }
  }, [chart]);

  return <div ref={ref} className="mermaid-container" style={{ display: 'flex', justifyContent: 'center', padding: '20px' }} />;
};

const CompilerLab: React.FC = () => {
  const [dsl, setDsl] = useState('domain Identity {\n  entity User {\n    id: uuid primary\n    email: string unique\n    loyaltyTier: LoyaltyTier\n  }\n\n  enum LoyaltyTier {\n    BASIC\n    GOLD\n    PLATINUM\n  }\n}');
  
  // V2.1 Shard State
  const [shards, setShards] = useState<any[]>([
    { key: 'identity', name: 'Identity Domain', dependsOn: [], entities: [{ name: 'User', fields: [{ name: 'id', type: 'uuid' }] }] },
    { key: 'billing', name: 'Billing Domain', dependsOn: ['identity'], entities: [{ name: 'Invoice', fields: [{ name: 'id', type: 'uuid' }, { name: 'userId', type: 'uuid' }] }] }
  ]);
  const [locks, setLocks] = useState<Record<string, any>>({});
  const [incremental, setIncremental] = useState(false);
  const [changedShards, setChangedShards] = useState<string[]>([]);
  const [dagOrder, setDagOrder] = useState<string[]>([]);

  const [ir, setIr] = useState<any>(null);
  const [spec, setSpec] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [mermaidChart, setMermaidChart] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'dsl' | 'shards' | 'ir' | 'spec' | 'plan' | 'diagram' | 'dag'>('dsl');
  const [pipelineStep, setPipelineStep] = useState<number>(0);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`].slice(-50));
  };

  const callTool = async (serverPath: string, toolName: string, args: any) => {
    setLoading(toolName);
    setError(null);
    addLog(`Calling ${toolName}...`);
    try {
      const serverCmd = 'node';
      const serverArgs = [serverPath]; 
      
      const response = await (window as any).electronAPI.callMcpTool(serverCmd, serverArgs, toolName, args);
      if (response.isError || (response.result?.isError)) {
        throw new Error(response.content?.[0]?.text || response.result?.content?.[0]?.text || 'Tool execution failed');
      }
      addLog(`✅ ${toolName} success.`);
      return response.result;
    } catch (err: any) {
      const msg = err.message || 'Unknown error';
      setError(msg);
      addLog(`❌ ${toolName} failed: ${msg}`);
      throw err;
    } finally {
      setLoading(null);
    }
  };

  const handleCompileShards = async () => {
    setPipelineStep(1);
    try {
        addLog("Initializing DAG Compilation...");
        
        // 1. Create Shard Files (Simulation for Lab)
        for (const shard of shards) {
            await callTool('./servers/archon/dist/index.js', 'archon_create_architecture_contract', {
                outPath: `/tmp/spec/domains/${shard.key}.json`,
                version: "1.0.0",
                domainShards: [shard.key],
                dependsOn: shard.dependsOn,
                owner: 'lab-agent'
            });
        }

        // 2. Compile Shards with DAG
        const compileResult = await callTool('./servers/archon/dist/index.js', 'archon_compile_spec_shards', {
            specDir: '/tmp/spec',
            outPath: '/tmp/spec/compiled/DesignSpec.json',
            changedShards: incremental ? changedShards : undefined
        });

        const sortedOrder = compileResult.structuredContent?.sortedOrder;
        setDagOrder(sortedOrder || []);
        addLog(`DAG Sorted Order: ${sortedOrder?.join(' -> ')}`);

        // 3. Load Compiled Spec
        // (Mocking the read back for lab purposes)
        setSpec({ version: "1.0.0", name: "LabApp", domains: shards });
        setPipelineStep(3);
        setActiveTab('spec');

    } catch (e) {
        setPipelineStep(0);
    }
  };

  const handleLockShard = async (shardKey: string) => {
    try {
        const result = await callTool('./servers/archon/dist/index.js', 'archon_lock_shard', {
            specDir: '/tmp/spec',
            shardName: `${shardKey}.json`,
            owner: 'lab-agent'
        });
        setLocks(prev => ({ ...prev, [shardKey]: result.structuredContent }));
    } catch (e) {}
  };

  const handleReleaseShard = async (shardKey: string) => {
    try {
        await callTool('./servers/archon/dist/index.js', 'archon_release_shard', {
            specDir: '/tmp/spec',
            shardName: `${shardKey}.json`,
            owner: 'lab-agent'
        });
        setLocks(prev => {
            const next = { ...prev };
            delete next[shardKey];
            return next;
        });
    } catch (e) {}
  };

  const handleCompile = async () => {
    setPipelineStep(1);
    try {
      // 1. UML -> IR
      const irResult = await callTool('./servers/uml/dist/index.js', 'uml_parse_ascii', { text: dsl });
      const parsedIr = JSON.parse(irResult.content?.[0]?.text || '{}');
      setIr(parsedIr);
      setPipelineStep(2);

      // 2. IR -> DesignSpec
      const specResult = await callTool('./servers/uml/dist/index.js', 'uml_ir_to_designspec', { ir: parsedIr });
      const parsedSpec = JSON.parse(specResult.content?.[0]?.text || '{}');
      setSpec(parsedSpec);
      setPipelineStep(3);

      // 3. IR -> Mermaid
      const mermaidResult = await callTool('./servers/uml/dist/index.js', 'uml_ir_to_mermaid', { ir: parsedIr });
      setMermaidChart(mermaidResult.content?.[0]?.text);
      
      if (activeTab === 'dsl') setActiveTab('diagram');
    } catch (e) {
      setPipelineStep(0);
    }
  };

  const handleFullPipeline = async () => {
    try {
        await handleCompile();
        setPipelineStep(4);
        await handleGeneratePlan();
        setPipelineStep(5);
        setActiveTab('plan');
    } catch (e) {}
  };

  const handleGeneratePlan = async (providedSpec?: any) => {
    const activeSpec = providedSpec || spec;
    if (!activeSpec) return;
    try {
        const planResult = await callTool('./servers/archon/dist/index.js', 'archon_plan_project', { 
            spec: activeSpec,
            outDir: '/tmp/archon-bench' 
        });
        
        setPlan(planResult.structuredContent?.executionPlan);
        if (!providedSpec) setActiveTab('plan');
    } catch (e) {}
  };

  const generateDagMermaid = () => {
    if (shards.length === 0) return '';
    let m = 'graph TD\n';
    shards.forEach(s => {
        s.dependsOn.forEach((d: string) => {
            m += `  ${d} --> ${s.key}\n`;
        });
        if (s.dependsOn.length === 0) m += `  ${s.key}\n`;
    });
    return m;
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '8px', letterSpacing: '-1.5px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Cpu className="text-accent-secondary" size={40} />
            Compiler Lab <span style={{ fontSize: '0.8rem', background: 'var(--accent-secondary)', color: 'white', padding: '4px 12px', borderRadius: '100px', verticalAlign: 'middle' }}>V2.1</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Distributed Enterprise Compiler: Multi-Shard DAG Orchestration.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={handleCompileShards} 
            disabled={!!loading}
            className="status-badge" 
            style={{ cursor: 'pointer', background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: '10px 24px', border: '1px solid var(--accent-secondary)' }}
          >
            {loading === 'archon_compile_spec_shards' ? <RefreshCw className="animate-spin" size={16} /> : <Workflow size={16} className="text-accent-secondary" />}
            COMPILE SHARDS (DAG)
          </button>
          
          <button 
            onClick={handleFullPipeline} 
            disabled={!!loading}
            className="status-badge" 
            style={{ cursor: 'pointer', background: 'var(--accent-primary)', color: 'white', border: 'none', padding: '10px 24px', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)' }}
          >
            <Sparkles size={16} /> RUN FULL PIPELINE
          </button>
        </div>
      </header>

      {/* Pipeline Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '32px', background: 'var(--bg-secondary)', padding: '12px 24px', borderRadius: '100px', border: '1px solid var(--border-color)', width: 'fit-content' }}>
        <Step icon={<Box size={14} />} label="SHARDS" active={pipelineStep >= 0} complete={pipelineStep > 0} />
        <div style={{ width: '20px', height: '1px', background: 'var(--border-color)' }} />
        <Step icon={<Network size={14} />} label="DAG" active={pipelineStep >= 1} complete={pipelineStep > 1} loading={loading === 'archon_compile_spec_shards'} />
        <div style={{ width: '20px', height: '1px', background: 'var(--border-color)' }} />
        <Step icon={<FileJson size={14} />} label="SPEC" active={pipelineStep >= 3} complete={pipelineStep > 3} loading={loading === 'uml_ir_to_designspec'} />
        <div style={{ width: '20px', height: '1px', background: 'var(--border-color)' }} />
        <Step icon={<Layout size={14} />} label="PLAN" active={pipelineStep >= 4} complete={pipelineStep > 4} loading={loading === 'archon_plan_project'} />
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'hidden' }}>
          {/* Tabs */}
          <div className="wf-tabs" style={{ borderRadius: '12px', padding: '6px' }}>
            <button className={`wf-tab ${activeTab === 'shards' ? 'active' : ''}`} onClick={() => setActiveTab('shards')}>Shard Manager</button>
            <button className={`wf-tab ${activeTab === 'dag' ? 'active' : ''}`} onClick={() => setActiveTab('dag')}>Dependency Graph</button>
            <button className={`wf-tab ${activeTab === 'dsl' ? 'active' : ''}`} onClick={() => setActiveTab('dsl')}>Legacy UML</button>
            <button className={`wf-tab ${activeTab === 'diagram' ? 'active' : ''}`} onClick={() => setActiveTab('diagram')} disabled={!mermaidChart}>Class Diagram</button>
            <button className={`wf-tab ${activeTab === 'spec' ? 'active' : ''}`} onClick={() => setActiveTab('spec')} disabled={!spec}>Compiled Spec</button>
            <button className={`wf-tab ${activeTab === 'plan' ? 'active' : ''}`} onClick={() => setActiveTab('plan')} disabled={!plan}>Execution Plan</button>
          </div>

          {/* Viewport */}
          <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: '24px', border: '1px solid var(--border-color)', position: 'relative', overflow: 'hidden', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2)' }}>
            {activeTab === 'shards' && (
              <div style={{ padding: '32px', height: '100%', overflow: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Domain Shards</h3>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', opacity: 0.7 }}>
                            <input type="checkbox" checked={incremental} onChange={(e) => setIncremental(e.target.checked)} id="inc-toggle" />
                            <label htmlFor="inc-toggle">Incremental Compile</label>
                        </div>
                        <button className="status-badge" style={{ background: 'var(--accent-secondary)', border: 'none', color: 'white' }}>+ NEW SHARD</button>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                    {shards.map((shard, i) => (
                        <div key={i} style={{ background: 'var(--bg-tertiary)', borderRadius: '16px', border: '1px solid var(--border-color)', padding: '20px', position: 'relative' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <div style={{ fontWeight: 800 }}>{shard.name}</div>
                                {locks[shard.key] ? (
                                    <button onClick={() => handleReleaseShard(shard.key)} style={{ background: 'rgba(239, 68, 68, 0.2)', color: 'var(--error)', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer' }}>
                                        LOCKED by {locks[shard.key].owner}
                                    </button>
                                ) : (
                                    <button onClick={() => handleLockShard(shard.key)} style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-tertiary)', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer' }}>
                                        LOCK
                                    </button>
                                )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                KEY: <code style={{ color: 'var(--accent-secondary)' }}>{shard.key}</code><br/>
                                DEPS: {shard.dependsOn.length > 0 ? shard.dependsOn.join(', ') : 'None'}
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', height: '4px', borderRadius: '2px' }} />
                                <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', height: '4px', borderRadius: '2px' }} />
                                <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', height: '4px', borderRadius: '2px' }} />
                            </div>
                        </div>
                    ))}
                </div>
              </div>
            )}
            {activeTab === 'dag' && (
                <div style={{ width: '100%', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Compilation Sequence:</div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {dagOrder.map((k, i) => (
                                <React.Fragment key={k}>
                                    <div style={{ background: 'var(--accent-secondary)', color: 'white', padding: '4px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 800 }}>{k}</div>
                                    {i < dagOrder.length - 1 && <ArrowRight size={14} opacity={0.5} />}
                                </React.Fragment>
                            ))}
                            {dagOrder.length === 0 && <span style={{ opacity: 0.3 }}>Not compiled yet.</span>}
                        </div>
                    </div>
                    <div style={{ flex: 1 }}>
                        <Mermaid chart={generateDagMermaid()} />
                    </div>
                </div>
            )}
            {activeTab === 'dsl' && (
              <textarea 
                value={dsl}
                onChange={(e) => setDsl(e.target.value)}
                spellCheck={false}
                style={{ width: '100%', height: '100%', background: 'transparent', border: 'none', color: '#e2e8f0', padding: '32px', fontFamily: '"Fira Code", monospace', fontSize: '1rem', lineHeight: 1.6, outline: 'none', resize: 'none' }}
              />
            )}
            {activeTab === 'diagram' && mermaidChart && (
                <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
                    <Mermaid chart={mermaidChart} />
                </div>
            )}
            {activeTab === 'ir' && (
              <pre style={{ width: '100%', height: '100%', overflow: 'auto', padding: '32px', color: '#818cf8', fontSize: '0.85rem' }}>
                {JSON.stringify(ir, null, 2)}
              </pre>
            )}
            {activeTab === 'spec' && (
              <pre style={{ width: '100%', height: '100%', overflow: 'auto', padding: '32px', color: '#10b981', fontSize: '0.85rem' }}>
                {JSON.stringify(spec, null, 2)}
              </pre>
            )}
            {activeTab === 'plan' && (
              <div style={{ padding: '32px', overflow: 'auto', height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <Box className="text-accent-secondary" />
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Plan Analysis: {plan?.metadata?.planId}</h3>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' }}>
                    <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 900, marginBottom: '4px' }}>OPERATIONS</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{plan?.operations?.length}</div>
                    </div>
                    <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 900, marginBottom: '4px' }}>RISK LEVEL</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 900, color: plan?.metadata?.riskLevel === 'High' ? 'var(--error)' : 'var(--success)' }}>{plan?.metadata?.riskLevel}</div>
                    </div>
                    <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 900, marginBottom: '4px' }}>STRATEGY</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{plan?.metadata?.strategy || 'Delta'}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {plan?.operations?.map((op: any, i: number) => (
                        <div key={i} style={{ padding: '16px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900 }}>{i+1}</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{op.type}: {op.path}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{op.summary}</div>
                            </div>
                            <ArrowRight size={14} style={{ opacity: 0.3 }} />
                        </div>
                    ))}
                </div>
              </div>
            )}
            
            {error && (
              <div style={{ position: 'absolute', bottom: '24px', left: '24px', right: '24px', background: 'rgba(239, 68, 68, 0.95)', border: '1px solid var(--error)', borderRadius: '16px', padding: '20px', display: 'flex', gap: '16px', alignItems: 'flex-start', backdropFilter: 'blur(20px)', animation: 'slideUp 0.3s ease', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', zIndex: 100 }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px', borderRadius: '8px' }}>
                    <AlertCircle className="text-white" size={24} />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, color: 'white', marginBottom: '4px', fontSize: '1rem' }}>Compilation Error</div>
                    <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)', fontFamily: 'monospace' }}>{error}</div>
                </div>
                <button onClick={() => setError(null)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', opacity: 0.5 }}>✕</button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Logs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'hidden' }}>
           <div style={{ background: 'var(--bg-secondary)', borderRadius: '24px', border: '1px solid var(--border-color)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.1)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Terminal size={16} /> LABORATORY LOGS
                </h3>
                <button onClick={() => setLogs([])} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                    <Trash2 size={14} />
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px', fontFamily: '"Fira Code", monospace', fontSize: '0.75rem' }}>
                {logs.length === 0 ? (
                    <div style={{ padding: '40px 0', textAlign: 'center', opacity: 0.3 }}>
                        <Search size={32} style={{ margin: '0 auto 16px' }} />
                        Waiting for compiler events...
                    </div>
                ) : logs.map((log, i) => (
                    <div key={i} style={{ marginBottom: '8px', color: log.includes('✅') ? 'var(--success)' : log.includes('❌') ? 'var(--error)' : 'var(--text-secondary)' }}>
                        {log}
                    </div>
                ))}
                <div id="logs-end" />
              </div>
           </div>

           <div style={{ background: 'var(--bg-secondary)', borderRadius: '24px', border: '1px solid var(--border-color)', padding: '24px' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={16} /> GOVERNANCE STATUS
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Policy Engine</span>
                    <span style={{ color: 'var(--success)', fontWeight: 800 }}>ACTIVE</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>DAG Engine</span>
                    <span style={{ color: 'var(--accent-secondary)', fontWeight: 800 }}>V2.1 ENABLED</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Registry</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>MODULAR_SHARDS</span>
                </div>
              </div>
           </div>
        </div>
      </div>
      
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .text-accent-secondary { color: var(--accent-secondary); }
        .text-error { color: var(--error); }
        .text-success { color: var(--success); }
        .text-white { color: white; }
        .mermaid-container svg { max-width: 100%; height: auto; }
      `}</style>
    </div>
  );
};

const Step: React.FC<{ icon: any, label: string, active: boolean, complete: boolean, loading?: boolean }> = ({ icon, label, active, complete, loading }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: active ? 1 : 0.3 }}>
        <div style={{ 
            width: '28px', height: '28px', borderRadius: '50%', 
            background: complete ? 'var(--success)' : loading ? 'var(--accent-primary)' : active ? 'var(--bg-tertiary)' : 'transparent',
            border: active && !complete && !loading ? '1px solid var(--border-color)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: complete || loading ? 'white' : 'var(--text-secondary)'
        }}>
            {loading ? <RefreshCw className="animate-spin" size={14} /> : complete ? <CheckCircle2 size={14} /> : icon}
        </div>
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: active ? 'var(--text-primary)' : 'var(--text-tertiary)', textTransform: 'uppercase' }}>{label}</span>
    </div>
);

export default CompilerLab;
