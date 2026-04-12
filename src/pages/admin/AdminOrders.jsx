import { useEffect, useState } from 'react'
import { sbGet, sbGetOne } from '../../lib/supabase'

export default function AdminOrders() {
  const [orders, setOrders] = useState([])
  const [restaurantsById, setRestaurantsById] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const rows = await sbGet('orders', {
        order: 'created_at.desc',
        limit: 40
      })
      setOrders(rows)

      const ids = [...new Set(rows.map((row) => row.restaurant_id).filter(Boolean))]
      const pairs = await Promise.all(ids.map(async (id) => [id, await sbGetOne('restaurants', { eq: { id } })]))
      setRestaurantsById(Object.fromEntries(pairs))
    } catch {
      setOrders([])
      setRestaurantsById({})
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 500, margin: '0 0 8px', fontFamily: "'Cormorant Garamond', serif" }}>
        Platform orders
      </h1>
      <p style={{ color: '#666', fontSize: 14, margin: '0 0 24px' }}>
        Latest orders across every restaurant, including payment and collection state.
      </p>

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
            <div style={{ color: '#ddd', fontSize: 13 }}>{order.status}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
