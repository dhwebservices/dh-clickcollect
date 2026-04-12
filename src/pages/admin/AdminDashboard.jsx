import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, ShoppingBag, TrendingUp, Clock4 } from 'lucide-react'
import { sbGet } from '../../lib/supabase'

export default function AdminDashboard() {
  const [restaurants, setRestaurants] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [restaurantRows, orderRows] = await Promise.all([
        sbGet('restaurants', { order: 'created_at.desc', limit: 12 }),
        sbGet('orders', { order: 'created_at.desc', limit: 24 })
      ])
      setRestaurants(restaurantRows)
      setOrders(orderRows)
    } catch {
      setRestaurants([])
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  const paidOrders = orders.filter((order) => order.payment_status === 'paid')
  const gross = paidOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0)
  const pending = orders.filter((order) => order.status === 'pending').length

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div>
        <h1 style={{ color: '#fff', fontSize: 30, fontWeight: 500, margin: '0 0 8px', fontFamily: "'Cormorant Garamond', serif" }}>
          Platform overview
        </h1>
        <p style={{ color: '#666', fontSize: 14, margin: 0 }}>
          Daily control layer for restaurants, incoming orders, payout configuration, and impersonation.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <StatCard icon={Store} label="Restaurants" value={restaurants.length} sub={`${restaurants.filter((item) => item.status === 'active').length} active`} />
        <StatCard icon={ShoppingBag} label="Recent orders" value={orders.length} sub={`${pending} pending right now`} />
        <StatCard icon={TrendingUp} label="Paid volume" value={`£${gross.toFixed(2)}`} sub={`${paidOrders.length} paid orders`} />
        <StatCard icon={Clock4} label="Suspended" value={restaurants.filter((item) => item.status === 'suspended').length} sub="Needs follow-up" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 20 }}>
        <section style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid #1e1e1e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#888', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>RESTAURANTS</span>
            <Link to="/admin/restaurants" style={{ color: '#C9A84C', textDecoration: 'none', fontSize: 13 }}>Manage all</Link>
          </div>
          {loading ? (
            <div style={{ padding: 24, color: '#666' }}>Loading restaurants...</div>
          ) : restaurants.map((restaurant) => (
            <Link
              key={restaurant.id}
              to={`/admin/restaurants/${restaurant.id}`}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '14px 20px', borderTop: '1px solid #111', textDecoration: 'none' }}
            >
              <div>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{restaurant.name}</div>
                <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>/{restaurant.slug}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: restaurant.status === 'active' ? '#86efac' : restaurant.status === 'pending' ? '#fcd34d' : '#fca5a5', fontSize: 13 }}>
                  {restaurant.status}
                </div>
                <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>{restaurant.plan}</div>
              </div>
            </Link>
          ))}
        </section>

        <section style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid #1e1e1e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#888', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>LATEST ORDERS</span>
            <Link to="/admin/orders" style={{ color: '#C9A84C', textDecoration: 'none', fontSize: 13 }}>View all</Link>
          </div>
          {loading ? (
            <div style={{ padding: 24, color: '#666' }}>Loading orders...</div>
          ) : orders.slice(0, 10).map((order) => (
            <div key={order.id} style={{ padding: '14px 20px', borderTop: '1px solid #111', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ color: '#fff', fontSize: 14 }}>#{order.order_number}</div>
                <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>{order.customer_name}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#C9A84C', fontWeight: 600, fontSize: 14 }}>£{Number(order.total).toFixed(2)}</div>
                <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>{order.status}</div>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: '#666', fontSize: 12 }}>{label}</span>
        <Icon size={16} color="#C9A84C" />
      </div>
      <div style={{ color: '#fff', fontSize: 26, fontWeight: 600 }}>{value}</div>
      <div style={{ color: '#666', fontSize: 12, marginTop: 6 }}>{sub}</div>
    </div>
  )
}
