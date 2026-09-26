import React, { useState, useEffect } from 'react'
import { ArrowLeft, Clock, Activity, Box, FileText, Shield, Search, Layers, ChevronRight } from 'lucide-react'

interface ArtifactLineageProps {
  path: string;
  onBack: () => void;
  onSelectTrace: (id: string) => void;
}

const getIpc = () => {
  return (window as any).electronAPI || {
    getArtifactHistory: async () => null,
    getAllLineage: async () => []
  }
}

const ArtifactLineageView: React.FC<ArtifactLineageProps> = ({ path: initialPath, onBack, onSelectTrace }) => {
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(initialPath)
  const [lineageData, setLineageData] = useState<any>(null)
  const [allLineages, setAllLineages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const ipc = getIpc();
        if (selectedPath) {
          const data = await ipc.getArtifactHistory(selectedPath)
          setLineageData(data)
        } else {
          const data = await ipc.getAllLineage()
          setAllLineages(data || [])
        }
      } catch (err) {
        console.error('Failed to fetch lineage data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [selectedPath])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
        <div style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.3 }}>SYNCING LINEAGE...</div>
      </div>
    )
  }

  // --- PROJECT SELECTION MODE ---
  if (!selectedProject && !selectedPath) {
    const projects = Array.from(new Set(allLineages.map(l => l.projectName || 'Default Project')))
    
    return (
      <div className="animate-fade-in standard-centered">
        <div style={{ marginBottom: '40px' }}>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 800, marginBottom: '12px', letterSpacing: '-1px' }}>Artifact Lineage</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '600px' }}>
            Select a project to explore its managed artifacts and mutation history.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
          {projects.map((project, idx) => {
            const projectArtifacts = allLineages.filter(l => (l.projectName || 'Default Project') === project)
            return (
              <div 
                key={idx} 
                className="trace-card" 
                onClick={() => setSelectedProject(project)}
                style={{ padding: '32px' }}
              >
                <div style={{ 
                  width: '56px', 
                  height: '56px', 
                  borderRadius: '12px', 
                  backgroundColor: 'rgba(99, 102, 241, 0.1)', 
                  color: 'var(--accent-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '24px'
                }}>
                  <Layers size={28} />
                </div>
                <h3 style={{ fontSize: '1.4rem', marginBottom: '8px', fontWeight: 800 }}>{project}</h3>
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', fontWeight: 600 }}>
                  {projectArtifacts.length} Managed Artifacts
                </div>
              </div>
            )
          })}
          {projects.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px', border: '1px dashed var(--border-color)', borderRadius: '20px', gridColumn: '1/-1' }}>
              <p style={{ color: 'var(--text-tertiary)' }}>No lineage data discovered.</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // --- ARTIFACT EXPLORER MODE ---
  if (!selectedPath) {
    const filtered = allLineages
      .filter(l => (l.projectName || 'Default Project') === selectedProject)
      .filter(l => l.path.toLowerCase().includes(searchQuery.toLowerCase()))

    return (
      <div className="animate-fade-in standard-centered">
        <button 
          onClick={() => setSelectedProject(null)} 
          style={{ marginBottom: '24px', display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '1px' }}
        >
          <ArrowLeft size={14} /> Back to Projects
        </button>

        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 800 }}>{selectedProject}</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Exploring managed artifacts for this architecture.</p>
        </div>

        <div style={{ marginBottom: '40px', position: 'relative' }}>
          <Search size={20} style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input 
            type="text" 
            placeholder={`Search artifacts in ${selectedProject}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ 
              width: '100%', 
              backgroundColor: 'var(--bg-secondary)', 
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              padding: '18px 24px 18px 60px',
              color: 'var(--text-primary)',
              fontSize: '1rem',
              outline: 'none'
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {filtered.map((lin, idx) => (
            <div 
              key={idx} 
              className="trace-card" 
              onClick={() => setSelectedPath(lin.path)}
              style={{ cursor: 'pointer', padding: '24px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--info)' }}>
                  <FileText size={22} />
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lin.path.split('/').pop()}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Fira Code' }}>{lin.path}</div>
                </div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', fontWeight: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                  <Clock size={14} />
                  <span>{lin.history.length} versions</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)' }}>
                  <Shield size={14} />
                  <span>MANAGED</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // --- DETAIL MODE ---
  return (
    <div className="animate-fade-in standard-centered">
      <button 
        onClick={() => setSelectedPath(null)} 
        style={{ marginBottom: '24px', display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '1px' }}
      >
        <ArrowLeft size={14} /> Back to Explorer
      </button>

      <div style={{ marginBottom: '48px' }}>
        <h1 style={{ fontSize: '2.4rem', fontWeight: 800, marginBottom: '16px' }}>Artifact History</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--accent-secondary)', backgroundColor: 'rgba(0,0,0,0.2)', padding: '14px 20px', borderRadius: '16px', border: '1px solid var(--border-color)', width: 'fit-content' }}>
          <FileText size={20} />
          <span style={{ fontFamily: 'Fira Code', fontWeight: 600 }}>{selectedPath}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '40px' }}>
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Mutation Timeline</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {lineageData?.history.map((entry: any, idx: number) => (
              <div 
                key={idx} 
                className="trace-card" 
                style={{ padding: '24px' }}
                onClick={() => onSelectTrace(entry.traceId)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                     <div style={{ 
                       padding: '10px', 
                       borderRadius: '10px', 
                       backgroundColor: entry.type === 'create' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                       color: entry.type === 'create' ? 'var(--success)' : 'var(--accent-secondary)'
                     }}>
                       <Activity size={20} />
                     </div>
                     <div>
                       <div style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.9rem', letterSpacing: '0.5px' }}>{entry.type}</div>
                       <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Verified mutation via Archon</div>
                     </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{new Date(entry.timestamp).toLocaleDateString()}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{new Date(entry.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '32px', padding: '16px', background: 'rgba(0,0,0,0.15)', borderRadius: '12px' }}>
                  <div>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', fontWeight: 800, textTransform: 'uppercase' }}>Trace</span>
                    <div style={{ fontFamily: 'Fira Code', fontSize: '0.85rem', marginTop: '4px' }}>{entry.traceId.substring(0, 13)}...</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', fontWeight: 800, textTransform: 'uppercase' }}>Plan</span>
                    <div style={{ fontFamily: 'Fira Code', fontSize: '0.85rem', marginTop: '4px' }}>{entry.planId}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside>
           <div style={{ 
            backgroundColor: 'var(--bg-secondary)', 
            border: '1px solid var(--border-color)',
            borderRadius: '24px',
            padding: '32px',
            position: 'sticky',
            top: '40px'
          }}>
            <h3 style={{ marginBottom: '24px', fontSize: '1.2rem', fontWeight: 800 }}>Intelligence Metadata</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>Ownership Class</div>
                <div style={{ fontSize: '1rem', color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Shield size={16} /> Managed Artifact
                </div>
              </div>
              
              <div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>Owning Capsule</div>
                <div style={{ fontSize: '0.95rem', color: 'var(--accent-secondary)', fontWeight: 700 }}>{lineageData?.owningCapsuleId || 'orchestrator.v2'}</div>
              </div>

              <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border-color)', fontSize: '0.85rem', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                This artifact is actively tracked for drift. Any out-of-band modifications will trigger a governance alert.
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default ArtifactLineageView
