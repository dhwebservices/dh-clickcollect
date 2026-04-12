import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { signInRestaurant } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInRestaurant(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || 'Invalid email or password')
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
          <div style={{ color: '#666', fontSize: 13, lineHeight: 1.6, maxWidth: 280 }}>
            Restaurant control panel for live orders, collections, menu updates, opening hours, and payment reporting.
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          {[
            ['Orders', 'Track incoming orders and collection status in real time.'],
            ['Kitchen', 'Run a focused kitchen screen without financial data.'],
            ['Payments', 'See totals, trends, and recent paid orders.']
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
            <div style={{ color: '#fff', fontSize: 28, fontWeight: 500, marginBottom: 8 }}>Restaurant sign in</div>
            <div style={{ color: '#666', fontSize: 14 }}>Use your restaurant staff credentials to open the dashboard or kitchen screen.</div>
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
            <Field label="Email address">
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
              {loading ? 'Signing in...' : 'Open restaurant portal'}
            </button>
          </form>

          <div style={{ marginTop: 22, color: '#666', fontSize: 13 }}>
            DH platform admin? <Link to="/admin/login" style={{ color: '#C9A84C', textDecoration: 'none' }}>Open admin sign in</Link>
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
