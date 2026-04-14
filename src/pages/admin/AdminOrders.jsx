import { useEffect, useState } from 'react'
import { AlertCircle, BellRing, PlusCircle } from 'lucide-react'
import { sbGet, sbGetOne, sbInsert, sbRpc } from '../../lib/supabase'

export default function AdminOrders() {
  const [orders, setOrders] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [restaurantsById, setRestaurantsById] = useState({})
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState(() => ({
    restaurantId: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    itemName: 'Manual test order',
    quantity: 1,
    total: '12.50',
    collectionDate: new Date().toISOString().split('T')[0],
    collectionTime: defaultCollectionTime(),
    notes: 'Admin test order',
    paymentStatus: 'paid',
  }))

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [orderRows, restaurantRows] = await Promise.all([
        sbGet('orders', { order: 'created_at.desc', limit: 40 }),
        sbGet('restaurants', { order: 'created_at.desc' }),
      ])
      const safeOrders = Array.isArray(orderRows) ? orderRows.filter(Boolean) : []
      const safeRestaurants = Array.isArray(restaurantRows) ? restaurantRows.filter(Boolean) : []
      setOrders(safeOrders)
      setRestaurants(safeRestaurants)
      setRestaurantsById(Object.fromEntries(safeRestaurants.map((restaurant) => [restaurant.id, restaurant])))
      setForm((current) => ({
        ...current,
        restaurantId: current.restaurantId || safeRestaurants[0]?.id || '',
      }))
    } catch {
      setOrders([])
      setRestaurants([])
      setRestaurantsById({})
    } finally {
      setLoading(false)
    }
  }

  async function createManualOrder(event) {
    event.preventDefault()
    setCreating(true)
    setError('')
    setMessage('')

    try {
      const restaurant = restaurantsById[form.restaurantId] || await sbGetOne('restaurants', { eq: { id: form.restaurantId } })
      if (!restaurant) throw new Error('Select a restaurant')

      const total = Number(form.total)
      if (!Number.isFinite(total) || total <= 0) throw new Error('Enter a valid total')
      if (!form.customerName.trim()) throw new Error('Customer name is required')
      if (!form.collectionTime.trim()) throw new Error('Collection time is required')

      const orderNumber = await sbRpc('generate_order_number', { p_restaurant_id: restaurant.id })
      const quantity = Math.max(1, Number(form.quantity) || 1)
      const itemName = form.itemName.trim() || 'Manual test order'

      const order = await sbInsert('orders', {
        restaurant_id: restaurant.id,
        order_number: orderNumber,
        customer_name: form.customerName.trim(),
        customer_email: form.customerEmail.trim() || null,
        customer_phone: form.customerPhone.trim() || null,
        items: JSON.stringify([{
          name: itemName,
          quantity,
          price: total / quantity,
          options: { source: 'Manual admin order' },
        }]),
        subtotal: total,
        commission_amount: total * (Number(restaurant.commission_rate || 0) / 100),
        total,
        collection_time: form.collectionTime.trim(),
        collection_date: form.collectionDate,
        status: 'pending',
        payment_method: 'manual',
        payment_status: form.paymentStatus,
        notes: form.notes.trim() || null,
      })

      if (import.meta.env.VITE_WORKER_URL) {
        fetch(`${import.meta.env.VITE_WORKER_URL}/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'order_confirmation',
            order,
            restaurant,
            customer: {
              name: form.customerName.trim(),
              email: form.customerEmail.trim() || null,
              phone: form.customerPhone.trim() || null,
            },
          }),
        }).catch(() => {})
      }

      setOrders((prev) => [order, ...prev])
      setMessage(`Manual order #${order.order_number} created and confirmation flow triggered.`)
      setForm((current) => ({
        ...current,
        customerName: '',
        customerEmail: '',
        customerPhone: '',
        itemName: 'Manual test order',
        quantity: 1,
        total: '12.50',
        collectionTime: defaultCollectionTime(),
        notes: 'Admin test order',
      }))
    } catch (err) {
      setError(err.message || 'Could not create test order')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div>
        <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 500, margin: '0 0 8px', fontFamily: "'Cormorant Garamond', serif" }}>
          Platform orders
        </h1>
        <p style={{ color: '#666', fontSize: 14, margin: '0 0 24px' }}>
          Latest orders across every restaurant. Use manual orders below to test kitchen flow, customer emails, and live updates.
        </p>
      </div>

      <section style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
          <div>
            <div style={{ color: '#888', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>TEST ORDER</div>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>Add manual order</div>
            <div style={{ color: '#666', fontSize: 13, marginTop: 6 }}>Creates a real pending order and sends the standard confirmation notification.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#C9A84C', fontSize: 13 }}>
            <BellRing size={14} />
            Notifications use the same worker path as checkout
          </div>
        </div>

        {error ? <Banner tone="danger" message={error} /> : null}
        {message ? <Banner tone="success" message={message} /> : null}

        <form onSubmit={createManualOrder} style={{ display: 'grid', gap: 16 }}>
          <div style={grid2}>
            <Field label="Restaurant">
              <select value={form.restaurantId} onChange={(e) => setForm((current) => ({ ...current, restaurantId: e.target.value }))} style={inputStyle}>
                <option value="">Select restaurant</option>
                {restaurants.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Customer name">
              <input value={form.customerName} onChange={(e) => setForm((current) => ({ ...current, customerName: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Customer email">
              <input type="email" value={form.customerEmail} onChange={(e) => setForm((current) => ({ ...current, customerEmail: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Customer phone">
              <input value={form.customerPhone} onChange={(e) => setForm((current) => ({ ...current, customerPhone: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Item / test label">
              <input value={form.itemName} onChange={(e) => setForm((current) => ({ ...current, itemName: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Quantity">
              <input type="number" min="1" value={form.quantity} onChange={(e) => setForm((current) => ({ ...current, quantity: Number(e.target.value) || 1 }))} style={inputStyle} />
            </Field>
            <Field label="Collection date">
              <input type="date" value={form.collectionDate} onChange={(e) => setForm((current) => ({ ...current, collectionDate: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Collection time">
              <input value={form.collectionTime} onChange={(e) => setForm((current) => ({ ...current, collectionTime: e.target.value }))} style={inputStyle} placeholder="18:15" />
            </Field>
            <Field label="Total">
              <input type="number" min="0.01" step="0.01" value={form.total} onChange={(e) => setForm((current) => ({ ...current, total: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Payment status">
              <select value={form.paymentStatus} onChange={(e) => setForm((current) => ({ ...current, paymentStatus: e.target.value }))} style={inputStyle}>
                <option value="paid">paid</option>
                <option value="pending">pending</option>
              </select>
            </Field>
          </div>

          <Field label="Notes">
            <textarea value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} style={{ ...inputStyle, minHeight: 84, resize: 'vertical' }} />
          </Field>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" disabled={creating} style={primaryButton}>
              <PlusCircle size={14} />
              {creating ? 'Creating...' : 'Create manual order'}
            </button>
          </div>
        </form>
      </section>

      <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.1fr 0.8fr 0.8fr 0.8fr', gap: 16, padding: '16px 20px', borderBottom: '1px solid #1e1e1e', color: '#777', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
          <span>ORDER</span>
          <span>RESTAURANT</span>
          <span>TOTAL</span>
          <span>PAYMENT</span>
          <span>STATUS</span>
        </div>
        {loading ? (
          <div style={{ padding: 24, color: '#666' }}>Loading orders...</div>
        ) : orders.length === 0 ? (
          <div style={{ padding: 24, color: '#666' }}>No orders found.</div>
        ) : orders.map((order) => (
          <div key={order.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.1fr 0.8fr 0.8fr 0.8fr', gap: 16, padding: '14px 20px', borderTop: '1px solid #111', alignItems: 'center' }}>
            <div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>#{order.order_number}</div>
              <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>{order.customer_name}</div>
            </div>
            <div style={{ color: '#ddd', fontSize: 14 }}>{restaurantsById[order.restaurant_id]?.name || 'Unknown restaurant'}</div>
            <div style={{ color: '#C9A84C', fontSize: 14, fontWeight: 600 }}>£{Number(order.total).toFixed(2)}</div>
            <div style={{ color: order.payment_status === 'paid' ? '#86efac' : '#fca5a5', fontSize: 13 }}>{order.payment_status}</div>
            <div style={{ color: '#ddd', fontSize: 13 }}>{order.status || 'unknown'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function defaultCollectionTime() {
  const next = new Date(Date.now() + 30 * 60000)
  return `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <span style={{ color: '#888', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{label}</span>
      {children}
    </label>
  )
}

function Banner({ tone, message }) {
  const styles = tone === 'success'
    ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac' }
    : { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }

  return (
    <div style={{ ...styles, borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
      <AlertCircle size={14} />
      <span>{message}</span>
    </div>
  )
}

const grid2 = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 14,
}

const inputStyle = {
  width: '100%',
  background: '#0f0f0f',
  border: '1px solid #2a2a2a',
  borderRadius: 8,
  padding: '11px 14px',
  color: '#fff',
  fontSize: 14,
  boxSizing: 'border-box',
  fontFamily: "'Outfit', sans-serif",
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
  cursor: 'pointer',
  fontFamily: "'Outfit', sans-serif",
}
