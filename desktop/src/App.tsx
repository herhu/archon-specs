import React, { useState, useEffect } from 'react'
import { 
  Activity, 
  Search, 
  FileText, 
  Layers, 
  Shield, 
  Clock, 
  ArrowRight,
  ChevronRight,
  Hash,
  Box,
  User,
  Zap,
  FolderOpen,
  Network,
  Terminal,
  Wrench,
  Cpu
} from 'lucide-react'


import TraceSearch from './components/TraceSearch'
import TraceDetail from './components/TraceDetail'
import ArtifactLineageView from './components/ArtifactLineage'
import MissionControl from './components/MissionControl'
import PlanArchive from './components/PlanArchive'
import WorkflowCenter from './components/WorkflowCenter'
import MCPInspector from './components/MCPInspector'
import ToolAdministrator from './components/ToolAdministrator'
import CompilerLab from './components/CompilerLab'

export type View = 'mission-control' | 'traces' | 'trace-detail' | 'artifact-history' | 'plan-archive' | 'workflow-center' | 'inspector' | 'tool-admin' | 'compiler-lab'

function App() {
  const [view, setView] = useState<View>('mission-control')
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null)
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null)
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('')

  useEffect(() => {
    if ((window as any).electronAPI) {
      (window as any).electronAPI.getWorkspaceRoot().then(setWorkspaceRoot)
    } else {
      console.warn('[App] electronAPI not found. Running in browser mode?')
    }
  }, [])

  const navigateToTrace = (traceId: string) => {
    setSelectedTraceId(traceId)
    setView('trace-detail')
  }

  const navigateToWorkflow = (traceId: string, spanId?: string) => {
    setSelectedTraceId(traceId)
    setSelectedSpanId(spanId || null)
    setView('workflow-center')
  }

  const navigateToArtifact = (path: string) => {
    setSelectedArtifact(path)
    setView('artifact-history')
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-text">
            <Shield size={20} color="var(--accent-secondary)" />
            ARCHON
          </div>
        </div>

        <nav className="nav-menu">
          <div 
            className={`nav-item ${view === 'mission-control' ? 'active' : ''}`}
            onClick={() => setView('mission-control')}
          >
            <Zap size={18} />
            <span>Mission Control</span>
          </div>
          <div 
            className={`nav-item ${view === 'traces' || view === 'trace-detail' ? 'active' : ''}`}
            onClick={() => setView('traces')}
          >
            <Activity size={18} />
            <span>Trace Explorer</span>
          </div>
          <div 
            className={`nav-item ${view === 'workflow-center' ? 'active' : ''}`}
            onClick={() => setView('workflow-center')}
          >
            <Network size={18} />
            <span>Workflow Center</span>
          </div>
          <div 
            className={`nav-item ${view === 'artifact-history' ? 'active' : ''}`}
            onClick={() => setView('artifact-history')}
          >
            <Layers size={18} />
            <span>Artifact Lineage</span>
          </div>
          <div 
            className={`nav-item ${view === 'plan-archive' ? 'active' : ''}`}
            onClick={() => setView('plan-archive')}
          >
            <Box size={18} />
            <span>Plan Archive</span>
          </div>
          <div 
            className={`nav-item ${view === 'inspector' ? 'active' : ''}`}
            onClick={() => setView('inspector')}
          >
            <Terminal size={18} />
            <span>MCP Inspector</span>
          </div>
          <div 
            className={`nav-item ${view === 'tool-admin' ? 'active' : ''}`}
            onClick={() => setView('tool-admin')}
          >
            <Wrench size={18} />
            <span>Tool Administrator</span>
          </div>
          <div 
            className={`nav-item ${view === 'compiler-lab' ? 'active' : ''}`}
            onClick={() => setView('compiler-lab')}
            style={{ marginTop: 'auto', marginBottom: '24px', border: '1px solid rgba(99, 102, 241, 0.2)', background: 'rgba(99, 102, 241, 0.05)' }}
          >
            <Cpu size={18} color="var(--accent-secondary)" />
            <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Compiler Lab</span>
          </div>
        </nav>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <div className="breadcrumb">
            Control Plane <ChevronRight size={14} style={{ margin: '0 8px' }} /> 
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {view === 'mission-control' ? 'Mission Control' : 
                 view === 'traces' || view === 'trace-detail' ? 'Trace Explorer' : 
                 view === 'workflow-center' ? 'Workflow Center' :
                 view === 'artifact-history' ? 'Artifact Lineage' : 
                 view === 'tool-admin' ? 'Tool Administrator' : 
                 view === 'compiler-lab' ? 'Compiler Lab' :
                 view === 'inspector' ? 'MCP Inspector' : 'Plan Archive'}
            </span>
          </div>
          <div className="status-cluster">
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                background: 'rgba(255,255,255,0.03)', 
                padding: '6px 14px', 
                borderRadius: '8px', 
                border: '1px solid var(--border-color)',
                fontSize: '0.75rem',
                cursor: 'pointer'
              }}
              onClick={async () => {
                const newRoot = await (window as any).electronAPI.setWorkspaceRoot()
                setWorkspaceRoot(newRoot)
              }}
            >
              <FolderOpen size={14} color="var(--accent-secondary)" />
              <span style={{ opacity: 0.5 }}>WORKSPACE:</span>
              <span style={{ fontWeight: 700 }}>{workspaceRoot.split('/').pop() || 'None'}</span>
            </div>
             <div className="status-badge">
               <div className="status-indicator"></div>
               System Health: Optimal
             </div>

              <div style={{ width: '32px', height: '32px', background: 'var(--bg-secondary)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', color: 'var(--text-tertiary)' }}>
                <Shield size={16} />
              </div>
          </div>
        </header>

        <div className="content-area">
          {view === 'mission-control' && <MissionControl onMissionStarted={navigateToWorkflow} />}
          {view === 'traces' && <TraceSearch onSelectTrace={navigateToWorkflow} />}
          {view === 'workflow-center' && (
            <WorkflowCenter 
              traceId={selectedTraceId || undefined} 
              spanId={selectedSpanId || undefined}
              onBack={() => setView('traces')} 
            />
          )}
          {view === 'trace-detail' && selectedTraceId && (
            <TraceDetail 
              traceId={selectedTraceId} 
              onBack={() => setView('traces')} 
              onSelectArtifact={navigateToArtifact}
            />
          )}
          {view === 'artifact-history' && (
            <ArtifactLineageView 
              path={selectedArtifact || ''} 
              onBack={() => setView('traces')} 
              onSelectTrace={navigateToWorkflow}
            />
          )}
          {view === 'plan-archive' && <PlanArchive />}
          {view === 'inspector' && <MCPInspector />}
          {view === 'tool-admin' && <ToolAdministrator onViewTrace={navigateToWorkflow} />}
          {view === 'compiler-lab' && <CompilerLab />}
        </div>
      </main>
    </div>
  )
}

export default App
