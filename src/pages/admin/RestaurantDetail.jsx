import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Eye, ChefHat, Save } from 'lucide-react'
import { sbGet, sbGetOne, sbUpdate } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

export default function RestaurantDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { startImpersonation } = useAuth()
  const [restaurant, setRestaurant] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(null)

  useEffect(() => {
    load()
  }, [id])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [record, recentOrders] = await Promise.all([
        sbGetOne('restaurants', { eq: { id } }),
        sbGet('orders', {
          eq: { restaurant_id: id },
          order: 'created_at.desc',
          limit: 10
        })
      ])
      setRestaurant(record)
      setForm(record)
      setOrders(recentOrders)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const updated = await sbUpdate('restaurants', { id }, form)
      setRestaurant(updated)
      setForm(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ color: '#666' }}>Loading restaurant...</div>
  }

  if (!restaurant || !form) {
    return <div style={{ color: '#fca5a5' }}>Restaurant not found.</div>
  }

  const paidRevenue = orders
    .filter((order) => order.payment_status === 'paid')
    .reduce((sum, order) => sum + (Number(order.total) || 0), 0)

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Link to="/admin/restaurants" style={{ color: '#666', textDecoration: 'none', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <ArrowLeft size={14} />
            Back to restaurants
          </Link>
          <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 500, margin: 0, fontFamily: "'Cormorant Garamond', serif" }}>
            {restaurant.name}
          </h1>
          <p style={{ color: '#666', fontSize: 14, margin: '8px 0 0' }}>
            Manage restaurant details, payment setup, and impersonation access.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              startImpersonation(restaurant)
              navigate('/dashboard')
            }}
            style={secondaryButton}
          >
            <Eye size={14} />
            Impersonate dashboard
          </button>
          <button
            type="button"
            onClick={() => {
              startImpersonation(restaurant)
              navigate('/kitchen')
            }}
            style={secondaryButton}
          >
            <ChefHat size={14} />
            Open kitchen view
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#fca5a5', borderRadius: 8, padding: '12px 16px', fontSize: 14 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 20 }}>
        <form onSubmit={handleSave} style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, padding: '20px' }}>
          <div style={{ color: '#888', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginBottom: 18 }}>RESTAURANT SETTINGS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Restaurant name"><input value={form.name || ''} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Slug"><input value={form.slug || ''} onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Email"><input value={form.email || ''} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Phone"><input value={form.phone || ''} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Plan">
              <select value={form.plan || 'basic'} onChange={(e) => setForm((prev) => ({ ...prev, plan: e.target.value }))} style={inputStyle}>
                <option value="basic">basic</option>
                <option value="pro">pro</option>
                <option value="premium">premium</option>
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status || 'active'} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))} style={inputStyle}>
                <option value="active">active</option>
                <option value="suspended">suspended</option>
                <option value="pending">pending</option>
              </select>
            </Field>
            <Field label="Brand colour"><input value={form.primary_color || '#C9A84C'} onChange={(e) => setForm((prev) => ({ ...prev, primary_color: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Commission %"><input type="number" step="0.1" min="0" max="100" value={form.commission_rate ?? 0.5} onChange={(e) => setForm((prev) => ({ ...prev, commission_rate: Number(e.target.value) }))} style={inputStyle} /></Field>
            <Field label="Stripe connected account"><input value={form.stripe_account_id || ''} onChange={(e) => setForm((prev) => ({ ...prev, stripe_account_id: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Address"><input value={form.address || ''} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} style={inputStyle} /></Field>
          </div>
          <div style={{ marginTop: 18 }}>
            <button type="submit" disabled={saving} style={primaryButton}>
              <Save size={14} />
              {saving ? 'Saving...' : 'Save restaurant'}
            </button>
          </div>
        </form>

        <div style={{ display: 'grid', gap: 20 }}>
          <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, padding: '20px' }}>
            <div style={{ color: '#888', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginBottom: 16 }}>SNAPSHOT</div>
            <Metric label="Recent paid volume" value={`£${paidRevenue.toFixed(2)}`} />
            <Metric label="Recent orders" value={orders.length} />
            <Metric label="Order page" value={restaurant.slug ? `/order/${restaurant.slug}` : 'Not set'} />
          </div>

          <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #1e1e1e', color: '#888', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
              RECENT ORDERS
            </div>
            {orders.length === 0 ? (
              <div style={{ padding: 20, color: '#666', fontSize: 13 }}>No orders yet.</div>
            ) : orders.map((order) => (
              <div key={order.id} style={{ padding: '12px 20px', borderTop: '1px solid #111', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ color: '#fff', fontSize: 14 }}>#{order.order_number}</div>
                  <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>{order.customer_name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#C9A84C', fontSize: 14, fontWeight: 600 }}>£{Number(order.total).toFixed(2)}</div>
                  <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>{order.status}</div>
                </div>
              </div>
            ))}
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

function Metric({ label, value }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: '#666', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginBottom: 5 }}>{label}</div>
      <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{value}</div>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  background: '#101010',
  border: '1px solid #262626',
  borderRadius: 8,
  padding: '12px 13px',
  color: '#fff',
  fontSize: 14,
  fontFamily: "'Outfit', sans-serif",
  boxSizing: 'border-box'
}

const primaryButton = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: '#C9A84C',
  color: '#0a0a0a',
  border: 'none',
  borderRadius: 8,
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer'
}

const secondaryButton = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: '#161616',
  color: '#ddd',
  border: '1px solid #262626',
  borderRadius: 8,
  padding: '12px 14px',
  fontSize: 14,
  cursor: 'pointer'
}
