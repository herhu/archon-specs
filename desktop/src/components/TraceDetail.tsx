import React, { useState, useEffect } from 'react'
import { ArrowLeft, ChevronRight, Clock, FileText, Layers, Shield, Box, Zap, AlertCircle } from 'lucide-react'

interface TraceDetailProps {
  traceId: string;
  onBack: () => void;
  onSelectArtifact: (path: string) => void;
}

const getIpc = () => {
  return (window as any).ipcRenderer || {
    getTrace: async () => null,
  }
}

const TraceDetail: React.FC<TraceDetailProps> = ({ traceId, onBack, onSelectArtifact }) => {
  const [trace, setTrace] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const fetchTrace = async () => {
      try {
        const data = await getIpc().getTrace(traceId)
        if (data) {
          setTrace(data)
          setLoading(false)
          // If the trace is found and it's already finished, we can stop polling
          if (data.status !== 'IN_PROGRESS' && data.status !== 'PENDING') {
            clearInterval(interval)
          }
        }
      } catch (err) {
        console.error('Failed to fetch trace:', err)
      }
    }

    fetchTrace()
    // Poll every 1.5 seconds to catch new events
    interval = setInterval(fetchTrace, 1500)
    
    return () => clearInterval(interval)
  }, [traceId])

  if (loading) return <div style={{ color: 'var(--text-secondary)' }}>Loading trace details...</div>
  if (!trace) return <div style={{ color: 'var(--error)' }}>Trace not found.</div>

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="nav-item" style={{ marginBottom: '24px', padding: '0', display: 'inline-flex' }}>
        <ArrowLeft size={18} />
        <span>Back to Explorer</span>
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '32px' }}>
        <div>
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '2.4rem', marginBottom: '8px', letterSpacing: '-1px' }}>
              Trace Analysis
            </h1>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
               <span style={{ fontFamily: 'Fira Code', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>{traceId}</span>
               <div className={`status-badge ${trace.status === 'SUCCESS' ? 'status-success' : 'status-failed'}`}>
                {trace.status}
              </div>
            </div>
          </div>

          {/* ROOT CAUSE BANNER */}
          {trace.insights?.rootCause && (
            <div style={{ 
              backgroundColor: 'rgba(239, 68, 68, 0.1)', 
              border: '1px solid var(--error)', 
              borderRadius: '12px', 
              padding: '20px', 
              marginBottom: '32px',
              display: 'flex',
              gap: '16px',
              alignItems: 'center'
            }}>
              <AlertCircle size={28} color="var(--error)" />
              <div>
                <div style={{ color: 'var(--error)', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '4px' }}>Root Cause Detected</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '4px' }}>{trace.insights.rootCause.operation}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{trace.insights.rootCause.message}</div>
              </div>
            </div>
          )}

          <section style={{ marginBottom: '40px' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '20px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Layers size={20} /> Execution Timeline
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              {Object.entries(
                trace.spans.reduce((acc: any, span: any) => {
                  const category = span.category || 'general';
                  if (!acc[category]) acc[category] = [];
                  acc[category].push(span);
                  return acc;
                }, {})
              ).map(([category, spans]: [string, any]) => (
                <div key={category}>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    fontWeight: 700, 
                    textTransform: 'uppercase', 
                    color: 'var(--text-tertiary)',
                    letterSpacing: '1px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <div style={{ width: '12px', height: '1px', backgroundColor: 'var(--border-color)' }}></div>
                    {category}
                    <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }}></div>
                    <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{spans.length} items</span>
                  </div>
                  
                  <div className="timeline">
                    {spans.map((span: any, idx: number) => (
                      <div key={span.spanId} style={{ 
                        display: 'flex', 
                        gap: '24px', 
                        marginBottom: '2px',
                        position: 'relative',
                        paddingLeft: '20px'
                      }}>
                        {/* Dot */}
                        <div style={{ 
                          position: 'absolute', 
                          left: '2px', 
                          top: '10px', 
                          width: '8px', 
                          height: '8px', 
                          borderRadius: '50%', 
                          backgroundColor: span.status === 'SUCCESS' ? 'var(--success)' : 'var(--error)',
                          zIndex: 2,
                          boxShadow: trace.insights?.criticalPath.includes(span.spanId) ? '0 0 15px var(--accent-primary)' : 'none'
                        }} />

                        <div style={{ 
                          backgroundColor: trace.insights?.criticalPath.includes(span.spanId) ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-secondary)', 
                          border: trace.insights?.criticalPath.includes(span.spanId) ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
                          boxShadow: trace.insights?.criticalPath.includes(span.spanId) ? '0 4px 20px rgba(59, 130, 246, 0.15)' : 'none',
                          borderRadius: '8px',
                          padding: '12px 16px',
                          width: '100%',
                          marginBottom: '12px',
                          transition: 'all 0.2s ease'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {trace.insights?.criticalPath.includes(span.spanId) && <Zap size={14} color="var(--accent-primary)" />}
                              {span.operation}
                            </span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                              {span.durationMs ? `${span.durationMs}ms` : ''} 
                              {span.durationMs && trace.durationMs ? ` (${Math.round((span.durationMs / trace.durationMs) * 100)}%)` : ''}
                            </span>
                          </div>
                          
                          {span.metadata?.path && (
                            <div 
                              onClick={() => onSelectArtifact(span.metadata.path)}
                              style={{ 
                                marginTop: '8px', 
                                fontSize: '0.8rem', 
                                color: 'var(--accent-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'pointer'
                              }}
                            >
                              <FileText size={12} />
                              <span style={{ textDecoration: 'underline' }}>{span.metadata.path}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside>
          <div style={{ 
            backgroundColor: 'var(--bg-secondary)', 
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '24px',
            position: 'sticky',
            top: '96px'
          }}>
            <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}>Contextual Insights</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="insight-item">
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '4px' }}>Total Duration</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-secondary)' }}>{trace.durationMs}ms</div>
              </div>

              {/* PRIMARY COST DRIVER */}
              {trace.insights?.bottlenecks && trace.insights.bottlenecks.length > 0 && (
                <div style={{ 
                  backgroundColor: 'rgba(245, 158, 11, 0.05)', 
                  border: '1px solid rgba(245, 158, 11, 0.2)', 
                  borderRadius: '12px', 
                  padding: '16px',
                  marginTop: '8px'
                }}>
                  <div style={{ color: 'var(--warning)', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Zap size={12} /> Primary Cost Driver
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {trace.insights.bottlenecks[0].operation}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Responsible for <strong>{trace.insights.bottlenecks[0].percentage}%</strong> of total time.
                  </div>
                </div>
              )}

              {/* BOTTLENECKS PANEL */}
              {trace.insights?.bottlenecks && trace.insights.bottlenecks.length > 0 && (
                <div style={{ marginTop: '12px', paddingTop: '24px', borderTop: '1px solid var(--border-color)' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Zap size={16} color="var(--warning)" /> Top Bottlenecks
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {trace.insights.bottlenecks.map((b: any, i: number) => (
                      <div key={i} style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.operation}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--warning)' }}>{b.percentage}%</span>
                        </div>
                        <div style={{ height: '4px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${b.percentage}%`, backgroundColor: 'var(--warning)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="insight-item">
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '4px' }}>Workspace</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{trace.workspaceId}</div>
              </div>
              
              <div className="insight-item">
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '4px' }}>Trigger Actor</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{trace.actorId}</div>
              </div>

              <div className="insight-item">
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '4px' }}>Plan Association</div>
                {trace.metadata?.planId ? (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    color: 'var(--accent-secondary)',
                    fontSize: '0.9rem',
                    border: '1px solid rgba(99, 102, 241, 0.2)'
                  }}>
                    <Box size={16} />
                    <span>{trace.metadata.planId}</span>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-tertiary)' }}>No plan linked</div>
                )}
              </div>

              <div style={{ 
                marginTop: '12px', 
                paddingTop: '20px', 
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)' }}>
                  <Shield size={16} />
                  <span style={{ fontSize: '0.85rem' }}>Shield Verified</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--info)' }}>
                  <Zap size={16} />
                  <span style={{ fontSize: '0.85rem' }}>Mutation Reconciled</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default TraceDetail
