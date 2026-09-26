import React, { useState, useEffect, useMemo } from 'react'
import { 
  Wrench, 
  Search, 
  Filter, 
  Terminal, 
  Code, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  ChevronRight,
  Database,
  Activity,
  History,
  Box,
  FileJson,
  Zap
} from 'lucide-react'
import { TraceModel, SpanModel } from '../../../src/observability/models'

const ToolAdministrator: React.FC<{ onViewTrace?: (traceId: string, spanId?: string) => void }> = ({ onViewTrace }) => {
  const [traces, setTraces] = useState<TraceModel[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedToolSpan, setSelectedToolSpan] = useState<SpanModel | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCESS' | 'FAILED'>('ALL')

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5000)
    
    // Real-time updates via electron listener
    if ((window as any).electronAPI?.onTraceUpdate) {
      (window as any).electronAPI.onTraceUpdate(() => {
        console.log('[ToolAdmin] Real-time update received')
        loadData()
      })
    }
    
    return () => clearInterval(interval)
  }, [])

  const loadData = async () => {
    try {
      const data = await (window as any).electronAPI.getTraces()
      setTraces(data || [])
    } catch (err) {
      console.error('Failed to load tool data:', err)
    } finally {
      setLoading(false)
    }
  }

  const allToolSpans = useMemo(() => {
    const spans: (SpanModel & { projectName?: string, traceId: string })[] = []
    traces.forEach(trace => {
      trace.spans.forEach(span => {
        // Filter for MCP Tools or spans with server names (tools/workers)
        if (span.serverName || span.category === 'mcp_tool' || span.category === 'mcp' || span.toolCategory) {
          spans.push({ 
            ...span, 
            projectName: trace.projectName,
            traceId: trace.traceId
          })
        }
      })
    })
    return spans.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  }, [traces])

  const filteredSpans = useMemo(() => {
    return allToolSpans.filter(s => {
      const matchesSearch = s.operation.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           s.serverName?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [allToolSpans, searchQuery, statusFilter])

  const stats = useMemo(() => {
    const total = allToolSpans.length
    const failed = allToolSpans.filter(s => s.status === 'FAILED').length
    const successRate = total > 0 ? ((total - failed) / total * 100).toFixed(1) : '100'
    const avgLatency = total > 0 ? (allToolSpans.reduce((acc, s) => acc + (s.durationMs || 0), 0) / total).toFixed(0) : '0'
    
    return { total, failed, successRate, avgLatency }
  }, [allToolSpans])

  return (
    <div className="animate-fade-in standard-centered" style={{ height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '8px', letterSpacing: '-1.5px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Wrench size={40} color="var(--accent-primary)" />
            Tool Administrator
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Audit orchestration patterns, tool queries, and execution results across the fabric.</p>
        </div>

        <div style={{ display: 'flex', gap: '24px' }}>
          <div className="stat-card" style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Success Rate</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--success)' }}>{stats.successRate}%</div>
          </div>
          <div className="stat-card" style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Avg Latency</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--warning)' }}>{stats.avgLatency}ms</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px', flex: 1, minHeight: 0 }}>
        {/* Left Pane: Tool Feed */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '12px', background: 'var(--bg-secondary)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.3 }} />
              <input 
                type="text" 
                placeholder="Search tools or servers..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px 10px 10px 40px', color: 'white', outline: 'none' }}
              />
            </div>
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0 16px', color: 'white', outline: 'none' }}
            >
              <option value="ALL">All Status</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
            {filteredSpans.map(span => (
              <div 
                key={span.spanId} 
                onClick={() => setSelectedToolSpan(span)}
                className={`tool-row ${selectedToolSpan?.spanId === span.spanId ? 'active' : ''}`}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '16px', 
                  padding: '16px', 
                  background: 'var(--bg-secondary)', 
                  borderRadius: '12px', 
                  border: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {span.status === 'FAILED' && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: 'var(--error)' }}></div>}
                
                <div style={{ width: '32px', height: '32px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {span.status === 'SUCCESS' ? <CheckCircle2 size={16} color="var(--success)" /> : <AlertCircle size={16} color="var(--error)" />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{span.serverName || 'CORE'}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>•</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', fontFamily: 'Fira Code' }}>{span.traceId.substring(0, 8)}</span>
                  </div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{span.operation}</h4>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--warning)' }}>{span.durationMs}ms</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>{new Date(span.startTime).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Pane: Tool Deep Dive */}
        <div style={{ width: '450px', background: 'var(--bg-secondary)', borderRadius: '24px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedToolSpan ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '32px', borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <Database size={18} color="var(--accent-secondary)" />
                  <span style={{ fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}>Tool Lineage</span>
                </div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '8px' }}>{selectedToolSpan.operation}</h3>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div className="status-badge" style={{ background: selectedToolSpan.status === 'SUCCESS' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: selectedToolSpan.status === 'SUCCESS' ? 'var(--success)' : 'var(--error)' }}>
                    {selectedToolSpan.status}
                  </div>
                  <div className="status-badge">
                    <Clock size={12} /> {selectedToolSpan.durationMs}ms
                  </div>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
                {/* Internal Execution Context */}
                {(selectedToolSpan.metadata.internalOperation || selectedToolSpan.metadata.action || selectedToolSpan.metadata.subTool || (selectedToolSpan.metadata.output as any)?.structuredContent?.type) && (
                  <section style={{ marginBottom: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <Activity size={14} color="var(--accent-primary)" />
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--accent-primary)', textTransform: 'uppercase' }}>Internal Execution</span>
                    </div>
                    <div style={{ background: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                        {selectedToolSpan.metadata.internalOperation || selectedToolSpan.metadata.action || selectedToolSpan.metadata.subTool || (selectedToolSpan.metadata.output as any)?.structuredContent?.type}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                        Detailed internal operation being executed by the worker.
                      </div>
                    </div>
                  </section>
                )}

                <section style={{ marginBottom: '32px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Terminal size={14} color="var(--text-tertiary)" />
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Query Arguments</span>
                  </div>
                  <div style={{ background: 'var(--bg-primary)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border-color)', overflowX: 'auto' }}>
                    <pre style={{ margin: 0, fontSize: '0.8rem', fontFamily: 'Fira Code', color: '#a5b4fc' }}>
                      {JSON.stringify(selectedToolSpan.metadata.input || {}, null, 2)}
                    </pre>
                  </div>
                </section>

                <section style={{ marginBottom: '32px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <FileJson size={14} color="var(--text-tertiary)" />
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Execution Result</span>
                  </div>
                  <div style={{ 
                    background: selectedToolSpan.status === 'FAILED' ? 'rgba(239, 68, 68, 0.02)' : 'var(--bg-primary)', 
                    borderRadius: '12px', 
                    padding: '16px', 
                    border: '1px solid',
                    borderColor: selectedToolSpan.status === 'FAILED' ? 'rgba(239, 68, 68, 0.2)' : 'var(--border-color)',
                    overflowX: 'auto' 
                  }}>
                    <pre style={{ margin: 0, fontSize: '0.8rem', fontFamily: 'Fira Code', color: selectedToolSpan.status === 'FAILED' ? 'var(--error)' : '#c7d2fe' }}>
                      {JSON.stringify(selectedToolSpan.metadata.output || selectedToolSpan.metadata.error || {}, null, 2)}
                    </pre>
                  </div>
                </section>

                {selectedToolSpan.status === 'FAILED' && (
                  <div style={{ padding: '20px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.1)', display: 'flex', gap: '16px' }}>
                    <AlertCircle size={20} color="var(--error)" style={{ flexShrink: 0 }} />
                    <div>
                      <h5 style={{ margin: '0 0 4px 0', fontSize: '0.85rem', fontWeight: 800, color: 'var(--error)' }}>Failure Detected</h5>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        The tool encountered an error during execution. Check the result payload for stack traces or error messages.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              
              <div style={{ padding: '24px', borderTop: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.1)' }}>
                <button 
                  onClick={() => onViewTrace && onViewTrace(selectedToolSpan.traceId, selectedToolSpan.spanId)}
                  className="action-button" 
                  style={{ width: '100%', padding: '14px', borderRadius: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <History size={16} /> VIEW TRACE CONTEXT
                </button>
              </div>
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px', textAlign: 'center', opacity: 0.2 }}>
              <Zap size={64} style={{ marginBottom: '24px' }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Select a tool call</h3>
              <p style={{ fontSize: '0.9rem' }}>Select an operation from the feed to audit its query and result payloads.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ToolAdministrator
