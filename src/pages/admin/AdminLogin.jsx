import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function AdminLogin() {
  const { signInAdmin, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/admin'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isAdmin) navigate('/admin', { replace: true })
  }, [isAdmin, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInAdmin(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || 'Admin sign in failed')
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
            Platform control for restaurant onboarding, Stripe setup, impersonation, order oversight, and commission reporting.
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          {[
            ['Restaurants', 'Manage profiles, status, commission, slots, and payout setup.'],
            ['Impersonation', 'Open the restaurant workspace or kitchen screen as that venue.'],
            ['Revenue', 'Track paid orders, gross volume, and platform commission.']
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
            <div style={{ color: '#666', fontSize: 14 }}>Use a DH platform admin account that also exists in `platform_admins`.</div>
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

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
            <Field label="Admin email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={inputStyle}
              />
            </Field>

            <Field label="Password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={inputStyle}
              />
            </Field>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? '#333' : '#C9A84C',
                color: loading ? '#666' : '#0a0a0a',
                border: 'none',
                borderRadius: 8,
                padding: '14px',
                fontSize: 15,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: "'Outfit', sans-serif"
              }}
            >
              {loading ? 'Signing in...' : 'Open admin panel'}
            </button>
          </form>

          <div style={{ marginTop: 22, color: '#666', fontSize: 13 }}>
            Restaurant account? <Link to="/login" style={{ color: '#C9A84C', textDecoration: 'none' }}>Go to restaurant sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <span style={{ color: '#888', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle = {
  width: '100%',
  background: '#111',
  border: '1px solid #2a2a2a',
  borderRadius: 8,
  padding: '13px 14px',
  color: '#fff',
  fontSize: 15,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: "'Outfit', sans-serif"
}
