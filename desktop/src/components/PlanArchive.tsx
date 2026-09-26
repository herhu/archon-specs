import React, { useState, useEffect } from 'react'
import { Box, Clock, Shield, CheckCircle, ArrowRight, Search } from 'lucide-react'

const getIpc = () => {
  return (window as any).electronAPI || {
    getPlans: async () => [],
  }
}

const PlanArchive: React.FC = () => {
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const fetchPlans = async () => {
      setLoading(true)
      try {
        const data = await getIpc().getPlans()
        setPlans(data || [])
      } catch (err) {
        console.error('Failed to fetch plans:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchPlans()
  }, [])

  const filtered = plans.filter(p => 
    p.metadata.planId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.metadata.summary.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
        <div style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.3 }}>SYNCING ARCHIVE...</div>
      </div>
    )
  }

  const getRiskColor = (level: string) => {
    switch (level?.toUpperCase()) {
      case 'HIGH': return 'var(--error)';
      case 'MEDIUM': return 'var(--warning)';
      case 'LOW': return 'var(--success)';
      default: return 'var(--text-tertiary)';
    }
  }

  return (
    <div className="animate-fade-in standard-centered">
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: '2.4rem', fontWeight: 800, marginBottom: '12px', letterSpacing: '-1px' }}>Plan Archive</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '600px' }}>
          Historical record of architectural materialization intent and risk assessments.
        </p>
      </div>

      <div style={{ marginBottom: '40px', position: 'relative' }}>
        <Search size={20} style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
        <input 
          type="text" 
          placeholder="Search plans by ID or summary..."
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
            outline: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '100px', border: '1px dashed var(--border-color)', borderRadius: '24px' }}>
            <Box size={48} style={{ marginBottom: '16px', opacity: 0.1, margin: '0 auto' }} />
            <p style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>No archived plans discovered.</p>
          </div>
        ) : (
          filtered.map((plan, idx) => (
            <div key={idx} className="trace-card" style={{ padding: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <div style={{ 
                    padding: '12px', 
                    borderRadius: '14px', 
                    backgroundColor: 'rgba(99, 102, 241, 0.1)', 
                    color: 'var(--accent-secondary)' 
                  }}>
                    <Box size={28} />
                  </div>
                  <div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '4px' }}>{plan.metadata.planId}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-tertiary)', fontSize: '0.85rem', fontWeight: 500 }}>
                      <Clock size={14} />
                      <span>{new Date(plan.metadata.generatedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ 
                    padding: '6px 14px', 
                    borderRadius: '20px', 
                    fontSize: '0.7rem', 
                    fontWeight: 900,
                    backgroundColor: `${getRiskColor(plan.metadata.riskLevel)}11`,
                    color: getRiskColor(plan.metadata.riskLevel),
                    border: `1px solid ${getRiskColor(plan.metadata.riskLevel)}33`,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    {plan.metadata.riskLevel} RISK
                  </div>
                  <div style={{ 
                    padding: '6px 14px', 
                    borderRadius: '20px', 
                    fontSize: '0.7rem', 
                    fontWeight: 900,
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    color: 'var(--success)',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    {plan.metadata.status}
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid var(--border-color)' }}>
                 <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.6 }}>
                   {plan.metadata.summary}
                 </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) auto', gap: '20px' }}>
                <div style={{ padding: '12px 20px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                   <div style={{ color: 'var(--text-tertiary)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Impact</div>
                   <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{plan.metadata.metrics.affectedPaths} files</div>
                </div>
                <div style={{ padding: '12px 20px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                   <div style={{ color: 'var(--text-tertiary)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Governance</div>
                   <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{plan.metadata.metrics.capsulesTouched} caps</div>
                </div>
                <div style={{ padding: '12px 20px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                   <div style={{ color: 'var(--text-tertiary)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Engine</div>
                   <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>v{plan.metadata.engineVersion}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                   <button className="icon-btn" style={{ width: '48px', height: '48px', borderRadius: '12px' }}>
                     <ArrowRight size={20} />
                   </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default PlanArchive
