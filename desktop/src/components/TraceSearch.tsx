import React, { useState, useEffect, useMemo } from 'react'
import { Search, Activity, Clock, Shield, ChevronRight, User, Box, Filter, CheckCircle2, Timer, ChevronDown, Wrench, Trash2 } from 'lucide-react'

import { TraceModel, SpanModel } from '../../../src/observability/models'

interface TraceSearchProps {
  onSelectTrace: (id: string) => void
}

const TraceSearch: React.FC<TraceSearchProps> = ({ onSelectTrace }) => {
  const [traces, setTraces] = useState<TraceModel[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedProjects, setExpandedProjects] = useState<string[]>([])

  const fetchTraces = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const data = await (window as any).electronAPI.getTraces()
      setTraces(data || [])
    } catch (err) {
      console.error('Failed to fetch traces:', err)
    } finally {
      if (showLoading) setLoading(false)
    }
  }


  useEffect(() => {
    fetchTraces()
  }, [])


  const filtered = traces.filter(t => 
    t.traceId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.projectName || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  const projectGroups = useMemo(() => {
    const groups: Record<string, TraceModel[]> = {};
    filtered.forEach(t => {
      const name = t.projectName || 'Default Project';
      if (!groups[name]) groups[name] = [];
      groups[name].push(t);
    });
    // Sort projects by latest activity
    return Object.entries(groups).sort((a, b) => {
        const lastA = Math.max(...a[1].map(t => new Date(t.startTime).getTime()));
        const lastB = Math.max(...b[1].map(t => new Date(t.startTime).getTime()));
        return lastB - lastA;
    });
  }, [filtered]);

  const toggleProject = (name: string) => {
    setExpandedProjects(prev => 
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
        <div style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.3 }}>DECODING CAUSAL LINEAGE...</div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in standard-centered">
      <div style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
           <div>
             <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '8px', letterSpacing: '-1.5px' }}>Trace Explorer</h1>
             <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '600px' }}>Inspect causal request lineage across the Archon ecosystem.</p>
           </div>
           <button className="status-badge" style={{ cursor: 'pointer' }}>
             <Filter size={14} /> Filters
           </button>
        </div>

        <div style={{ position: 'relative' }}>
          <Search size={20} style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input 
            type="text" 
            placeholder="Search by Trace ID or Project Name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ 
              width: '100%', 
              backgroundColor: 'var(--bg-secondary)', 
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              padding: '20px 24px 20px 60px',
              color: 'var(--text-primary)',
              fontSize: '1rem',
              outline: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {projectGroups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '100px', opacity: 0.2 }}>
            <Activity size={48} style={{ margin: '0 auto 16px' }} />
            <p style={{ fontWeight: 800, letterSpacing: '2px' }}>NO TRACES DISCOVERED</p>
          </div>
        ) : (
          projectGroups.map(([projectName, projectTraces]) => {
            const isExpanded = expandedProjects.includes(projectName);
            const totalStages = projectTraces.reduce((acc, t) => acc + t.spans.length, 0);
            const lastActivity = Math.max(...projectTraces.map(t => new Date(t.startTime).getTime()));
            
            return (
              <div key={projectName} style={{ background: 'var(--bg-secondary)', borderRadius: '20px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                {/* Project Header Card */}
                <div 
                  onClick={() => toggleProject(projectName)}
                  style={{ 
                    padding: '28px', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    transition: 'all 0.2s'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <Box size={20} className="text-accent" style={{ color: 'var(--accent-secondary)' }} />
                        <h3 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.5px' }}>{projectName}</h3>
                    </div>
                    <div className="trace-meta">
                       <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                         <Clock size={14} />
                         <span>Last activity: {new Date(lastActivity).toLocaleString()}</span>
                       </div>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                         <Activity size={14} />
                         <span>{projectTraces.length} Total Traces</span>
                       </div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div 
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`Are you sure you want to clean up all data for project "${projectName}"?`)) {
                          try {
                            console.log(`[UI] Requesting cleanup for project: ${projectName}`);
                            const success = await (window as any).electronAPI.cleanupData(projectName);
                            if (success) {
                                console.log(`[UI] Cleanup successful for ${projectName}`);
                                fetchTraces(false);
                            }
                          } catch (err) {
                            console.error(`Cleanup failed for ${projectName}:`, err);
                            alert('Failed to clean project data. Error: ' + (err as Error).message);
                          }
                        }
                      }}

                      style={{ 
                        padding: '8px', 
                        borderRadius: '8px', 
                        background: 'rgba(239, 68, 68, 0.05)', 
                        color: '#ef4444', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        border: '1px solid rgba(239, 68, 68, 0.1)',
                        zIndex: 100,
                        position: 'relative'
                      }}

                      title={`Cleanup ${projectName}`}
                    >
                      <Trash2 size={16} />
                    </div>
                    <div className="trace-status" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-secondary)', padding: '6px 12px' }}>
                      {totalStages} TOTAL STAGES
                    </div>
                    {isExpanded ? <ChevronDown size={24} style={{ opacity: 0.5 }} /> : <ChevronRight size={24} style={{ opacity: 0.5 }} />}
                  </div>

                </div>

                {/* Expanded Trace List */}
                {isExpanded && (
                  <div style={{ padding: '0 28px 28px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', marginBottom: '8px' }} />
                    {projectTraces.sort((a,b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()).map(trace => (
                      <div 
                        key={trace.traceId} 
                        className="trace-card" 
                        onClick={(e) => { e.stopPropagation(); onSelectTrace(trace.traceId); }}
                        style={{ 
                          margin: 0, 
                          padding: '16px 20px', 
                          background: 'rgba(255,255,255,0.02)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                         <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
                                {trace.spans.some(s => s.operation.startsWith('mcp_tool:')) ? <Wrench size={18} /> : <Activity size={18} />}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', fontFamily: 'Fira Code', color: 'var(--text-tertiary)', fontWeight: 600 }}>{trace.traceId}</div>
                                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                                    {trace.spans[0]?.operation.replace('mcp_tool:', 'Tool: ') || 'Orchestration Mission'}
                                </div>
                            </div>
                         </div>
                         
                         <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                                {new Date(trace.startTime).toLocaleTimeString()}
                            </div>
                            <div className="trace-status" style={{ fontSize: '0.6rem', padding: '3px 8px' }}>
                                {trace.spans.length} SPANS
                            </div>
                            <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />
                         </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default TraceSearch
