import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function AdminLogin() {
  const { signInAdmin, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/admin'

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isAdmin) navigate('/admin', { replace: true })
  }, [isAdmin, navigate])

  async function handleMicrosoftLogin() {
    setError('')
    setLoading(true)
    try {
      await signInAdmin()
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || 'Microsoft sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'grid',
      gridTemplateColumns: 'minmax(320px, 460px) minmax(420px, 1fr)',
      fontFamily: "'Outfit', sans-serif"
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Outfit:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div style={{
        background: '#111',
        borderRight: '1px solid #1e1e1e',
        padding: '48px 40px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}>
        <div>
          <div style={{ color: '#C9A84C', fontFamily: "'Cormorant Garamond', serif", fontSize: 28, marginBottom: 10 }}>
            DH Click & Collect
          </div>
          <div style={{ color: '#666', fontSize: 13, lineHeight: 1.6, maxWidth: 300 }}>
            Platform control for onboarding restaurants, checking orders, editing payout settings, and impersonating operations safely.
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          {[
            ['Restaurants', 'Manage setup, status, commission, hours, and payout details.'],
            ['Impersonation', 'Open a live restaurant dashboard or kitchen view as that venue.'],
            ['Revenue', 'Track paid volume and platform commission in one place.']
          ].map(([title, body]) => (
            <div key={title} style={{ border: '1px solid #202020', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{title}</div>
              <div style={{ color: '#666', fontSize: 13, lineHeight: 1.5 }}>{body}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ marginBottom: 30 }}>
            <div style={{ color: '#fff', fontSize: 28, fontWeight: 500, marginBottom: 8 }}>Admin sign in</div>
            <div style={{ color: '#666', fontSize: 14 }}>Use your DH Microsoft account. Restaurant staff and kitchen users still sign in with email and password.</div>
          </div>

          {error && (
            <div style={{
              background: 'rgba(220,38,38,0.1)',
              border: '1px solid rgba(220,38,38,0.3)',
              color: '#fca5a5',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 18,
              fontSize: 14
            }}>
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleMicrosoftLogin}
            disabled={loading}
            style={{
              width: '100%',
              background: loading ? '#1a1a1a' : '#fff',
              color: loading ? '#555' : '#0a0a0a',
              border: '1px solid #333',
              borderRadius: 8,
              padding: '14px',
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              fontFamily: "'Outfit', sans-serif"
            }}
          >
            {!loading && (
              <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
                <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
              </svg>
            )}
            {loading ? 'Opening Microsoft sign in...' : 'Continue with Microsoft'}
          </button>

          <div style={{ marginTop: 22, color: '#666', fontSize: 13 }}>
            Restaurant account? <Link to="/login" style={{ color: '#C9A84C', textDecoration: 'none' }}>Go to restaurant sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
