import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Store, ExternalLink, Eye, ChefHat, AlertCircle } from 'lucide-react'
import { sbGet, sbInsert, sbUpdate } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const PLANS = ['basic', 'pro', 'premium']
const STATUSES = ['active', 'suspended', 'pending']

export default function Restaurants() {
  const navigate = useNavigate()
  const { startImpersonation } = useAuth()
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const rows = await sbGet('restaurants', { order: 'created_at.desc' })
      setRestaurants(rows)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function updateStatus(id, status) {
    try {
      await sbUpdate('restaurants', { id }, { status })
      setRestaurants((prev) => prev.map((restaurant) => (
        restaurant.id === id ? { ...restaurant, status } : restaurant
      )))
    } catch (err) {
      alert('Update failed: ' + err.message)
    }
  }

  function openImpersonation(restaurant, destination) {
    startImpersonation(restaurant)
    navigate(destination)
  }

  if (loading) return <Loader />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, gap: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 500, margin: 0, fontFamily: "'Cormorant Garamond', serif" }}>
            Restaurants
          </h1>
          <p style={{ color: '#666', fontSize: 14, margin: '8px 0 0' }}>
            Create restaurants, manage their commercial setup, and jump into their dashboard or kitchen workflow.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#C9A84C', color: '#0a0a0a', border: 'none',
            borderRadius: 8, padding: '11px 16px', fontSize: 14,
            fontWeight: 600, cursor: 'pointer', fontFamily: "'Outfit', sans-serif"
          }}
        >
          <Plus size={16} /> Add restaurant
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      {showAdd && (
        <AddRestaurantForm
          onClose={() => setShowAdd(false)}
          onCreated={(restaurant) => {
            setRestaurants((prev) => [restaurant, ...prev])
            setShowAdd(false)
          }}
        />
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {restaurants.map((restaurant) => (
          <div key={restaurant.id} style={{
            background: '#141414',
            border: '1px solid #1e1e1e',
            borderRadius: 12,
            padding: '18px 20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: '#1e1e1e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `1px solid ${(restaurant.primary_color || '#C9A84C')}40`,
                  flexShrink: 0
                }}>
                  <Store size={17} color={restaurant.primary_color || '#C9A84C'} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 500, marginBottom: 4 }}>{restaurant.name}</div>
                  <div style={{ color: '#555', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>/{restaurant.slug}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={pillStyle}>{restaurant.plan}</span>
                <select
                  value={restaurant.status}
                  onChange={(e) => updateStatus(restaurant.id, e.target.value)}
                  style={{ ...selectStyle, color: restaurant.status === 'active' ? '#86efac' : restaurant.status === 'suspended' ? '#fca5a5' : '#fcd34d' }}
                >
                  {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                <a
                  href={`/order/${restaurant.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#666', display: 'flex', alignItems: 'center' }}
                >
                  <ExternalLink size={14} />
                </a>
                <Link to={`/admin/restaurants/${restaurant.id}`} style={ghostLink}>
                  Manage
                </Link>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
              <button type="button" onClick={() => openImpersonation(restaurant, '/dashboard')} style={ghostButton}>
                <Eye size={14} />
                Impersonate dashboard
              </button>
              <button type="button" onClick={() => openImpersonation(restaurant, '/kitchen')} style={ghostButton}>
                <ChefHat size={14} />
                Open kitchen
              </button>
            </div>
          </div>
        ))}
      </div>

      {restaurants.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#555', border: '1px dashed #222', borderRadius: 12, marginTop: 18 }}>
          <Store size={40} color="#333" style={{ marginBottom: 12 }} />
          <div>No restaurants yet. Add your first one.</div>
        </div>
      )}
    </div>
  )
}

function AddRestaurantForm({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', slug: '', email: '', phone: '', address: '',
    plan: 'basic', primary_color: '#C9A84C', commission_rate: 0.5, status: 'active'
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handleChange(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'name' && !prev.slug) {
        next.slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      }
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const created = await sbInsert('restaurants', form)
      onCreated(created)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, padding: '24px', marginBottom: 20 }}>
      <h3 style={{ color: '#fff', margin: '0 0 20px', fontSize: 18, fontWeight: 500 }}>Add new restaurant</h3>
      {error && <ErrorBanner message={error} />}
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <Field label="Restaurant name *"><input style={inputStyle} value={form.name} onChange={(e) => handleChange('name', e.target.value)} required /></Field>
          <Field label="Slug *"><input style={inputStyle} value={form.slug} onChange={(e) => handleChange('slug', e.target.value)} required pattern="[a-z0-9\\-]+" /></Field>
          <Field label="Email"><input style={inputStyle} type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} /></Field>
          <Field label="Phone"><input style={inputStyle} value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} /></Field>
          <Field label="Plan">
            <select style={inputStyle} value={form.plan} onChange={(e) => handleChange('plan', e.target.value)}>
              {PLANS.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
            </select>
          </Field>
          <Field label="Commission %"><input style={inputStyle} type="number" step="0.1" min="0" max="100" value={form.commission_rate} onChange={(e) => handleChange('commission_rate', Number(e.target.value))} /></Field>
          <Field label="Brand colour"><input style={inputStyle} value={form.primary_color} onChange={(e) => handleChange('primary_color', e.target.value)} /></Field>
          <Field label="Status">
            <select style={inputStyle} value={form.status} onChange={(e) => handleChange('status', e.target.value)}>
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ marginBottom: 14 }}>
          <Field label="Address"><input style={inputStyle} value={form.address} onChange={(e) => handleChange('address', e.target.value)} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid #333', color: '#888', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}>Cancel</button>
          <button type="submit" disabled={saving} style={{ background: '#C9A84C', color: '#0a0a0a', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Outfit', sans-serif" }}>
            {saving ? 'Creating...' : 'Create restaurant'}
          </button>
        </div>
      </form>
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

function ErrorBanner({ message }) {
  return (
    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
      <AlertCircle size={14} /> {message}
    </div>
  )
}

function Loader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <div style={{ width: 28, height: 28, border: '2px solid #222', borderTop: '2px solid #C9A84C', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  background: '#0f0f0f',
  border: '1px solid #2a2a2a',
  borderRadius: 8,
  padding: '11px 12px',
  color: '#fff',
  fontSize: 14,
  boxSizing: 'border-box',
  fontFamily: "'Outfit', sans-serif"
}

const selectStyle = {
  background: '#161616',
  border: '1px solid #2a2a2a',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 12,
  fontFamily: "'JetBrains Mono', monospace"
}

const pillStyle = {
  color: '#888',
  fontSize: 12,
  background: '#181818',
  border: '1px solid #2a2a2a',
  borderRadius: 999,
  padding: '6px 10px',
  fontFamily: "'JetBrains Mono', monospace"
}

const ghostLink = {
  color: '#C9A84C',
  fontSize: 13,
  textDecoration: 'none',
  padding: '8px 10px',
  border: '1px solid rgba(201,168,76,0.28)',
  borderRadius: 8
}

const ghostButton = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: '#111',
  border: '1px solid #262626',
  color: '#ddd',
  borderRadius: 8,
  padding: '10px 12px',
  cursor: 'pointer',
  fontFamily: "'Outfit', sans-serif",
  fontSize: 13
}
