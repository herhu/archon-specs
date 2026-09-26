import React, { useState, useEffect } from 'react'
import { Terminal, RefreshCw, ExternalLink, Shield, Zap, Info, Play, Server, Command, Box, Square, Loader2 } from 'lucide-react'

const MCPInspector: React.FC = () => {
  const [isActive, setIsActive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [waitingForUrl, setWaitingForUrl] = useState(false)
  const [url, setUrl] = useState('')
  const [serverCmd, setServerCmd] = useState('npx')
  const [serverArgs, setServerArgs] = useState('@modelcontextprotocol/server-filesystem /Users/hernan/Desktop')

  useEffect(() => {
    const unsub = (window as any).electronAPI.onInspectorUrl((newUrl: string) => {
      console.log('Received Inspector URL:', newUrl)
      setUrl(newUrl)
      setWaitingForUrl(false)
      setIsActive(true)
      setLoading(false)
    })
    return () => {
      if (unsub && typeof unsub === 'function') unsub()
    }
  }, [])

  const handleActivate = async () => {
    setLoading(true)
    setWaitingForUrl(true)
    try {
      const args = serverArgs.split(' ').filter(a => a.trim() !== '')
      await (window as any).electronAPI.activateMcpInspector(serverCmd, args)
      // We don't set isActive here anymore, we wait for the URL from stdout
    } catch (err) {
      console.error('Failed to activate inspector:', err)
      setLoading(false)
      setWaitingForUrl(false)
    }
  }

  const handleStop = async () => {
    setLoading(true)
    try {
      await (window as any).electronAPI.stopMcpInspector()
      setIsActive(false)
      setWaitingForUrl(false)
      setUrl('')
    } catch (err) {
      console.error('Failed to stop inspector:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-fade-in standard-centered" style={{ height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '8px', letterSpacing: '-1.5px' }}>MCP Inspector</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Embed the official @modelcontextprotocol/inspector directly into Archon.</p>
        </div>
        
        {isActive && (
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => setUrl(`${url.split('?')[0]}?t=${Date.now()}&${url.split('?')[1]}`)} className="status-badge" style={{ cursor: 'pointer' }}>
              <RefreshCw size={14} /> REFRESH
            </button>
            <button onClick={handleStop} className="status-badge" style={{ cursor: 'pointer', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
              <Square size={14} /> STOP SERVER
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: '24px', border: '1px solid var(--border-color)', overflow: 'hidden', position: 'relative' }}>
        {waitingForUrl ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px' }}>
             <Loader2 size={48} className="animate-spin" style={{ color: 'var(--accent-secondary)', marginBottom: '24px' }} />
             <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '12px' }}>Establishing Protocol Bridge</h3>
             <p style={{ color: 'var(--text-secondary)', maxWidth: '400px' }}>Spawning inspector process and capturing secure auth token...</p>
             <button onClick={handleStop} style={{ marginTop: '32px', color: 'var(--error)', background: 'transparent', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Cancel Activation</button>
          </div>
        ) : !isActive ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '60px' }}>
            <div style={{ maxWidth: '600px', margin: '0 auto', width: '100%' }}>
              <div style={{ textAlign: 'center', marginBottom: '48px' }}>
                <div style={{ width: '64px', height: '64px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-secondary)', margin: '0 auto 24px' }}>
                  <Terminal size={32} />
                </div>
                <h3 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '12px' }}>Inspector Configuration</h3>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>Configure the MCP server you wish to inspect. Archon will spawn the official debugger and bridge it to this viewport.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-tertiary)' }}>Server Entry Command</label>
                  <div style={{ position: 'relative' }}>
                    <Command size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', opacity: 0.3 }} />
                    <input 
                      type="text" 
                      value={serverCmd}
                      onChange={(e) => setServerCmd(e.target.value)}
                      placeholder="e.g. node, npx, uvx"
                      style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px 16px 16px 48px', color: 'white', outline: 'none', fontSize: '1rem', fontFamily: 'Fira Code' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-tertiary)' }}>Arguments & Path</label>
                  <div style={{ position: 'relative' }}>
                    <Box size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', opacity: 0.3 }} />
                    <input 
                      type="text" 
                      value={serverArgs}
                      onChange={(e) => setServerArgs(e.target.value)}
                      placeholder="e.g. path/to/server.js arg1 arg2"
                      style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px 16px 16px 48px', color: 'white', outline: 'none', fontSize: '1rem', fontFamily: 'Fira Code' }}
                    />
                  </div>
                </div>

                <button 
                  onClick={handleActivate}
                  disabled={loading}
                  style={{ 
                    marginTop: '20px',
                    padding: '18px', 
                    background: 'var(--accent-primary)', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '16px', 
                    fontWeight: 800, 
                    fontSize: '1rem',
                    cursor: loading ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    boxShadow: '0 12px 32px rgba(99, 102, 241, 0.3)',
                    opacity: loading ? 0.6 : 1,
                    transition: 'all 0.2s'
                  }}
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
                  {loading ? 'SPAWNING INSPECTOR...' : 'LAUNCH INSPECTOR FABRIC'}
                </button>
              </div>

              <div style={{ marginTop: '40px', padding: '20px', background: 'rgba(245, 158, 11, 0.05)', borderRadius: '16px', border: '1px solid rgba(245, 158, 11, 0.1)', display: 'flex', gap: '16px' }}>
                <Info size={20} color="var(--warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--warning)' }}>Developer Note:</strong> Archon will automatically capture the secure token from the inspector's output to bridge the session.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <iframe 
            src={url} 
            style={{ width: '100%', height: '100%', border: 'none' }} 
            title="MCP Inspector"
          />
        )}
      </div>
    </div>
  )
}

export default MCPInspector
