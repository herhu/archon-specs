import React, { useState, useEffect, useMemo } from 'react'
import { 
  Network, 
  Clock, 
  Shield, 
  Layers, 
  CheckCircle2, 
  XCircle, 
  Activity, 
  Brain,
  History,
  Target,
  Timer,
  Zap,
  Cpu,
  Terminal,
  Folder,
  ChevronRight,
  Activity as Pulse,
  Minus
} from 'lucide-react'
import { TraceModel, SpanModel } from '../../../src/observability/models'

interface WorkflowCenterProps {
  traceId?: string
  spanId?: string
  onBack?: () => void
}

const WorkflowCenter: React.FC<WorkflowCenterProps> = ({ traceId, spanId }) => {
  const [traces, setTraces] = useState<TraceModel[]>([])
  const [selectedTrace, setSelectedTrace] = useState<TraceModel | null>(null)
  const [selectedSpan, setSelectedSpan] = useState<SpanModel | null>(null)
  const [intelligence, setIntelligence] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'timeline' | 'intelligence'>('timeline')
  const [initialTraceLoaded, setInitialTraceLoaded] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [expandedSideProjects, setExpandedSideProjects] = useState<string[]>([])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (traceId && traces.length > 0 && !initialTraceLoaded) {
      const trace = traces.find(t => t.traceId === traceId)
      if (trace) {
        setSelectedTrace(trace)
        setInitialTraceLoaded(true)
      }
    }
  }, [traceId, traces, initialTraceLoaded])

  useEffect(() => {
    if (selectedTrace) {
        const name = selectedTrace.projectName || 'Default Project';
        if (!expandedSideProjects.includes(name)) {
            setExpandedSideProjects(prev => [...prev, name]);
        }

        // If spanId is provided, try to find and select it
        if (spanId && !selectedSpan) {
            const span = selectedTrace.spans.find(s => s.spanId === spanId);
            if (span) {
                setSelectedSpan(span);
                
                // Also ensure the folder is expanded if it's a core span
                const op = span.operation.toLowerCase();
                let category = 'FABRIC';
                if (op.includes('archon_workflow_materialize') || op.includes('archon_materialization_')) {
                    category = 'MATERIALIZE';
                } else if (op.includes('archon_workflow_')) {
                    category = 'GOVERNANCE';
                } else if (span.operation.includes(':')) {
                    const parts = span.operation.split(':');
                    const pathParts = parts[1].split('.');
                    category = pathParts[0];
                } else if (span.operation.includes('.')) {
                    category = span.operation.split('.')[0];
                }
                
                setExpandedFolders(prev => ({ ...prev, [category]: true }));
            }
        }
    }
  }, [selectedTrace, spanId, selectedSpan])

  const loadData = async () => {
    try {
      const [allTraces, intel] = await Promise.all([
        (window as any).electronAPI.getTraces(),
        (window as any).electronAPI.getSystemIntelligence()
      ])
      const fetchedTraces = allTraces || [];
      setTraces(fetchedTraces)
      setIntelligence(intel)

      if (selectedTrace) {
        const updated = fetchedTraces.find((t: TraceModel) => t.traceId === selectedTrace.traceId);
        if (updated) setSelectedTrace(updated);
      }
    } catch (err) {
      console.error('Failed to load workflow data:', err)
    }
  }

  const projectGroups = useMemo(() => {
    const groups: Record<string, TraceModel[]> = {};
    traces.forEach(t => {
      const name = t.projectName || 'Default Project';
      if (!groups[name]) groups[name] = [];
      groups[name].push(t);
    });
    return Object.entries(groups).sort((a, b) => {
        const lastA = Math.max(...a[1].map(t => new Date(t.startTime).getTime()));
        const lastB = Math.max(...b[1].map(t => new Date(t.startTime).getTime()));
        return lastB - lastA;
    });
  }, [traces]);

  const toggleSideProject = (name: string) => {
    setExpandedSideProjects(prev => 
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    )
  }

  const sortedSpans = useMemo(() => {
    if (!selectedTrace) return []
    return [...selectedTrace.spans].sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    )
  }, [selectedTrace])

  const groupedCoreSpans = useMemo(() => {
    const core = sortedSpans.filter(s => 
      !s.serverName || 
      s.category === 'orchestrator' || 
      s.category === 'materializer' ||
      s.operation.includes('archon_workflow_materialize') ||
      s.operation.includes('archon_materialization_')
    );
    const groups: Record<string, SpanModel[]> = {};

    core.forEach((s: SpanModel) => {
      // Logic: RUN_RULE:SCAFFOLD.CONTROLLER.COLLECTION -> SCAFFOLD
      let category = 'FABRIC';
      const op = s.operation.toLowerCase();
      
      if (op.includes('archon_workflow_materialize') || op.includes('archon_materialization_')) {
        category = 'MATERIALIZE';
      } else if (op.includes('archon_workflow_')) {
        category = 'GOVERNANCE';
      } else if (s.operation.includes(':')) {
        const parts = s.operation.split(':');
        const pathParts = parts[1].split('.');
        category = pathParts[0];
      } else if (s.operation.includes('.')) {
        category = s.operation.split('.')[0];
      }
      
      if (!groups[category]) groups[category] = [];
      groups[category].push(s);
    });

    return groups;
  }, [sortedSpans])

  const toggleFolder = (cat: string) => {
    setExpandedFolders(prev => ({ ...prev, [cat]: !prev[cat] }));
  }

  const formatTimeWithMs = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + d.getMilliseconds().toString().padStart(3, '0');
  }

  const getTotalDuration = (trace: TraceModel) => {
    if (trace.spans.length === 0) return 0;
    const start = Math.min(...trace.spans.map(s => new Date(s.startTime).getTime()));
    const end = Math.max(...trace.spans.map(s => new Date(s.endTime || s.startTime).getTime()));
    return end - start;
  }

  const getShortName = (op: string) => {
    if (op.includes(':')) {
      const parts = op.split(':');
      const subParts = parts[1].split('.');
      return subParts.slice(1).join('.');
    }
    return op;
  }

  return (
    <div className="wf-viewport">
      <div className="wf-header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #6366f1, #818cf8)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <Network size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Workflow Center</h2>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Execution Fabric</p>
          </div>
        </div>

        {intelligence && (
          <div style={{ display: 'flex', gap: '24px' }}>
            <div className="stat-item">
              <span className="stat-label">Success Rate</span>
              <span className="stat-value" style={{ color: 'var(--success)' }}>{intelligence.systemHealth.successRate.toFixed(1)}%</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Avg Latency</span>
              <span className="stat-value" style={{ color: 'var(--warning)' }}>{intelligence.systemHealth.avgDurationMs.toFixed(0)}ms</span>
            </div>
          </div>
        )}
      </div>

      <div className="wf-content-grid">
        <div className="wf-sidebar-pane">
          <div className="wf-tabs">
            <button onClick={() => setActiveTab('timeline')} className={`wf-tab ${activeTab === 'timeline' ? 'active' : ''}`}>Timeline</button>
            <button onClick={() => setActiveTab('intelligence')} className={`wf-tab wf-tab-intel ${activeTab === 'intelligence' ? 'active' : ''}`}>Intelligence</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            {activeTab === 'timeline' ? (
              projectGroups.map(([projectName, projectTraces]) => (
                <div key={projectName} style={{ marginBottom: '12px' }}>
                   <div 
                     onClick={() => toggleSideProject(projectName)}
                     style={{ 
                        padding: '10px 14px', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        cursor: 'pointer',
                        borderRadius: '8px',
                        background: 'rgba(255,255,255,0.03)',
                        marginBottom: '4px'
                     }}
                   >
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Folder size={12} color="var(--accent-secondary)" />
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>{projectName}</span>
                     </div>
                     <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>{projectTraces.length}</span>
                   </div>
                   
                   {expandedSideProjects.includes(projectName) && (
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '12px' }}>
                        {projectTraces.sort((a,b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()).map(t => (
                          <div 
                            key={t.traceId} 
                            onClick={() => setSelectedTrace(t)} 
                            className={`wf-item-card ${selectedTrace?.traceId === t.traceId ? 'active' : ''}`}
                            style={{ padding: '8px 12px', margin: 0, borderRadius: '8px' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontSize: '0.55rem', fontWeight: 900 }}>
                              <span style={{ color: 'var(--text-tertiary)', fontFamily: 'Fira Code' }}>{t.traceId.substring(0, 8)}</span>
                              <span style={{ color: t.outcome?.status === 'VERIFIED' ? 'var(--success)' : 'var(--text-tertiary)' }}>{t.outcome?.status || 'PENDING'}</span>
                            </div>
                            <h4 style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.9 }}>
                                {t.spans[0]?.operation.replace('mcp_tool:', '') || 'Mission'}
                            </h4>
                          </div>
                        ))}
                     </div>
                   )}
                </div>
              ))
            ) : (
              <div style={{ padding: '8px' }}>
                <h5 style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent-secondary)', textTransform: 'uppercase', marginBottom: '16px' }}>Anomalies</h5>
                {intelligence?.recurringIssues.map((issue: any) => (
                  <div key={issue.target} style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '10px', marginBottom: '8px' }}>
                    <p style={{ fontSize: '0.7rem', fontWeight: 600 }}>{issue.target}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="wf-timeline-pane" style={{ padding: '40px 60px' }}>
          {selectedTrace ? (
            <div style={{ maxWidth: '900px' }}>
              <div style={{ marginBottom: '48px' }}>
                <h3 style={{ fontSize: '2.2rem', fontWeight: 800 }}>{selectedTrace.projectName}</h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', fontFamily: 'Fira Code', marginTop: '4px' }}>{selectedTrace.traceId}</div>
              </div>

              <div className="wf-swimlane-area" style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
                 {/* 1. GATEWAY & 2. TOOLS - Subtle Chips */}
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ position: 'relative', paddingLeft: '24px', borderLeft: '2px solid var(--accent-secondary)' }}>
                       <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--accent-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Network Gateway</div>
                       <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {sortedSpans.filter(s => s.serverName?.includes('remote')).map(s => (
                            <div key={s.spanId} onClick={() => setSelectedSpan(s)} style={{ padding: '6px 12px', background: selectedSpan?.spanId === s.spanId ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                               {s.operation} <span style={{ marginLeft: '6px', color: 'var(--warning)', opacity: 0.8 }}>{s.durationMs}ms</span>
                            </div>
                          ))}
                       </div>
                    </div>

                    <div style={{ position: 'relative', paddingLeft: '24px', borderLeft: '2px solid var(--warning)' }}>
                       <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Execution Workers (MCP)</div>
                       <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {sortedSpans.filter(s => s.serverName && !s.serverName.includes('remote')).map(s => (
                            <div key={s.spanId} onClick={() => setSelectedSpan(s)} style={{ padding: '6px 12px', background: selectedSpan?.spanId === s.spanId ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                               {s.status === 'SUCCESS' ? <CheckCircle2 size={12} color="#10b981" /> : <XCircle size={12} color="#ef4444" />}
                               {s.operation} <span style={{ color: 'var(--warning)' }}>{s.durationMs}ms</span>
                            </div>
                          ))}
                       </div>
                    </div>
                 </div>

                 {/* 3. CORE FABRIC - Clean Logical Grouping */}
                 <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '40px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '24px' }}>Architectural Governance Fabric</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {Object.entries(groupedCoreSpans).map(([category, spans]) => (
                        <div key={category} style={{ border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', background: 'rgba(255,255,255,0.01)' }}>
                          <div onClick={() => toggleFolder(category)} style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 'rgba(0,0,0,0.2)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <Folder size={14} color="var(--text-tertiary)" />
                              <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{category}</span>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>{spans.length} STAGES</span>
                            </div>
                            <ChevronRight size={14} style={{ transform: expandedFolders[category] ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', opacity: 0.3 }} />
                          </div>
                          
                          {expandedFolders[category] && (
                            <div style={{ padding: '16px', display: 'flex', flexWrap: 'wrap', gap: '6px', background: 'rgba(0,0,0,0.1)' }}>
                              {spans.map(s => (
                                <div key={s.spanId} onClick={() => setSelectedSpan(s)} style={{ padding: '4px 10px', background: selectedSpan?.spanId === s.spanId ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', color: selectedSpan?.spanId === s.spanId ? 'var(--success)' : 'var(--text-secondary)', transition: 'all 0.1s' }}>
                                  {getShortName(s.operation)} <span style={{ marginLeft: '4px', opacity: 0.4 }}>{s.durationMs}ms</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                 </div>
              </div>
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.1 }}>
              <Pulse size={64} />
            </div>
          )}
        </div>

        <div className="wf-diag-pane" style={{ padding: '32px' }}>
          {selectedSpan ? (
            <div className="animate-fade-in">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
                <Shield size={18} color="var(--accent-secondary)" />
                <h4 style={{ fontSize: '0.8rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1.5px' }}>Diagnostics</h4>
              </div>
              
              <div style={{ padding: '24px', background: 'rgba(255,255,255,0.03)', borderRadius: '14px', border: '1px solid var(--border-color)', marginBottom: '32px' }}>
                <div style={{ fontSize: '0.6rem', opacity: 0.3, fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Operation</div>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', wordBreak: 'break-all', fontFamily: 'Fira Code' }}>{selectedSpan.operation}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--warning)', fontWeight: 800, marginTop: '20px' }}>
                  {selectedSpan.durationMs}ms execution
                </div>
              </div>

              <div style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                   <Terminal size={14} color="var(--text-tertiary)" />
                   <span style={{ fontSize: '0.65rem', opacity: 0.5, fontWeight: 900, textTransform: 'uppercase' }}>Lineage</span>
                </div>
                {selectedSpan.events.map((e: any) => (
                  <div key={e.timestamp} style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '8px', fontSize: '0.7rem', display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span style={{ opacity: 0.4, fontFamily: 'Fira Code', fontWeight: 700, color: 'var(--warning)' }}>{formatTimeWithMs(e.timestamp)}</span>
                    <span style={{ fontWeight: 800, color: 'var(--accent-secondary)' }}>{e.eventType}</span>
                  </div>
                ))}
              </div>

              {selectedTrace && selectedSpan && selectedTrace.spans.filter(s => s.parentSpanId === selectedSpan.spanId).length > 0 && (
                <div style={{ marginBottom: '32px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                     <Activity size={14} color="var(--success)" />
                     <span style={{ fontSize: '0.65rem', opacity: 0.5, fontWeight: 900, textTransform: 'uppercase' }}>Sub-Execution Trace</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedTrace.spans
                      .filter(s => s.parentSpanId === selectedSpan.spanId)
                      .sort((a,b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                      .map(sub => (
                        <div 
                          key={sub.spanId} 
                          onClick={() => setSelectedSpan(sub)}
                          style={{ 
                            padding: '12px', 
                            background: 'rgba(16, 185, 129, 0.05)', 
                            borderRadius: '10px', 
                            border: '1px solid rgba(16, 185, 129, 0.1)',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                          className="hover:bg-emerald-500/10 transition-colors"
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-primary)' }}>{sub.operation.replace('mcp_tool:', '')}</span>
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>{formatTimeWithMs(sub.startTime)}</span>
                          </div>
                          <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--warning)' }}>{sub.durationMs}ms</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.05 }}>
              <Zap size={48} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default WorkflowCenter
