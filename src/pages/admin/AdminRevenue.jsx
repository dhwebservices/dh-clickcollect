import { useEffect, useState } from 'react'
import { sbGet, sbGetOne } from '../../lib/supabase'

export default function AdminRevenue() {
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
        filter: { payment_status: 'eq.paid' },
        order: 'created_at.desc',
        limit: 250
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

  const gross = orders.reduce((sum, order) => sum + (Number(order.total) || 0), 0)
  const commission = orders.reduce((sum, order) => sum + (Number(order.commission_amount) || 0), 0)

  const restaurantRows = Object.values(
    orders.reduce((acc, order) => {
      const bucket = acc[order.restaurant_id] || {
        restaurant_id: order.restaurant_id,
        orders: 0,
        gross: 0,
        commission: 0
      }
      bucket.orders += 1
      bucket.gross += Number(order.total) || 0
      bucket.commission += Number(order.commission_amount) || 0
      acc[order.restaurant_id] = bucket
      return acc
    }, {})
  ).sort((a, b) => b.gross - a.gross)

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div>
        <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 500, margin: '0 0 8px', fontFamily: "'Cormorant Garamond', serif" }}>
          Revenue
        </h1>
        <p style={{ color: '#666', fontSize: 14, margin: 0 }}>
          Gross paid volume and DH commission totals across the platform.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <MetricCard label="Paid volume" value={`£${gross.toFixed(2)}`} />
        <MetricCard label="Platform commission" value={`£${commission.toFixed(2)}`} />
        <MetricCard label="Paid orders" value={orders.length} />
      </div>

      <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 0.9fr 0.9fr', gap: 16, padding: '16px 20px', borderBottom: '1px solid #1e1e1e', color: '#777', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
          <span>RESTAURANT</span>
          <span>ORDERS</span>
          <span>GROSS</span>
          <span>COMMISSION</span>
        </div>
        {loading ? (
          <div style={{ padding: 24, color: '#666' }}>Loading revenue...</div>
        ) : restaurantRows.length === 0 ? (
          <div style={{ padding: 24, color: '#666' }}>No paid orders yet.</div>
        ) : restaurantRows.map((row) => (
          <div key={row.restaurant_id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 0.9fr 0.9fr', gap: 16, padding: '14px 20px', borderTop: '1px solid #111', alignItems: 'center' }}>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{restaurantsById[row.restaurant_id]?.name || 'Unknown restaurant'}</div>
            <div style={{ color: '#ddd', fontSize: 13 }}>{row.orders}</div>
            <div style={{ color: '#C9A84C', fontSize: 14, fontWeight: 600 }}>£{row.gross.toFixed(2)}</div>
            <div style={{ color: '#ddd', fontSize: 13 }}>£{row.commission.toFixed(2)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricCard({ label, value }) {
  return (
    <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ color: '#666', fontSize: 12, marginBottom: 10 }}>{label}</div>
      <div style={{ color: '#fff', fontSize: 24, fontWeight: 600 }}>{value}</div>
    </div>
  )
}
