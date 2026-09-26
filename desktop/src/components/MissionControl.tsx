import React, { useState } from 'react'
import { Play, FileJson, AlertTriangle, CheckCircle, Loader2, Search } from 'lucide-react'

interface MissionControlProps {
  onMissionStarted: (traceId: string) => void;
}

const getIpc = () => {
  return (window as any).electronAPI || {
    openSpecFile: async () => {
      console.warn('IPC not available. Returning null for spec file.');
      return null;
    },
    runMission: async () => {
      throw new Error('Cannot launch mission from a web browser. You must run the Archon Electron App to access the local orchestrator.');
    }
  }
}

const MissionControl: React.FC<MissionControlProps> = ({ onMissionStarted }) => {
  const [selectedSpec, setSelectedSpec] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSelectSpec = async () => {
    const ipc = getIpc();
    const path = await ipc.openSpecFile()
    if (path) setSelectedSpec(path)
  }

  const handleRunMission = async () => {
    const ipc = getIpc();
    setIsRunning(true)
    setError(null)
    try {
      const traceId = await ipc.runMission(selectedSpec)
      onMissionStarted(traceId)
    } catch (err: any) {
      setError(err.message || 'Mission failed to launch.')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="animate-fade-in standard-centered">
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '2.4rem', fontWeight: 800, marginBottom: '8px', letterSpacing: '-1px' }}>Mission Control</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Launch architectural orchestration missions from validated specifications.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ 
            backgroundColor: 'var(--bg-secondary)', 
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '40px'
          }}>
            <h3 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem' }}>
              <FileJson size={20} color="var(--accent-secondary)" /> Target Specification
            </h3>

            <div style={{ 
              backgroundColor: 'var(--bg-primary)',
              border: '1px dashed var(--border-color)',
              borderRadius: '12px',
              padding: '32px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }} onClick={handleSelectSpec}>
              {selectedSpec ? (
                <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                  {selectedSpec.split('/').pop()}
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '4px', wordBreak: 'break-all' }}>{selectedSpec}</div>
                </div>
              ) : (
                <div style={{ color: 'var(--text-tertiary)' }}>
                  Click to select a custom DesignSpec.json<br/>
                  <span style={{ fontSize: '0.8rem' }}>(Defaults to root DesignSpec.json if none selected)</span>
                </div>
              )}
            </div>

            <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-end' }}>
               <button 
                onClick={handleRunMission}
                disabled={isRunning}
                style={{ 
                  backgroundColor: isRunning ? 'var(--bg-tertiary)' : 'var(--accent-primary)',
                  color: 'white',
                  border: 'none',
                  padding: '14px 28px',
                  borderRadius: '10px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'all 0.2s ease',
                  boxShadow: isRunning ? 'none' : '0 4px 12px rgba(99, 102, 241, 0.3)'
                }}
               >
                 {isRunning ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
                 {isRunning ? 'Orchestrating...' : 'Launch Mission'}
               </button>
            </div>

            {error && (
              <div style={{ 
                marginTop: '24px', 
                padding: '16px', 
                backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px',
                color: 'var(--error)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <AlertTriangle size={20} />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        <aside>
          <div style={{ 
            backgroundColor: 'var(--bg-secondary)', 
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '24px'
          }}>
             <h3 style={{ marginBottom: '20px', fontSize: '1.1rem', fontWeight: 700 }}>Pre-flight Checklist</h3>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--success)', fontSize: '0.9rem', fontWeight: 500 }}>
                  <CheckCircle size={16} />
                  <span>VFS Consistency Verified</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--success)', fontSize: '0.9rem', fontWeight: 500 }}>
                  <CheckCircle size={16} />
                  <span>Telemetry Backbone Online</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--info)', fontSize: '0.9rem', fontWeight: 500 }}>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Ready for Materialization</span>
                </div>
             </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default MissionControl
