import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, ShoppingBag, PoundSterling, ChefHat } from 'lucide-react'
import { useRestaurant } from '../../contexts/RestaurantContext'
import { sbGet } from '../../lib/supabase'

export default function RestaurantOverview() {
  const { restaurant } = useRestaurant()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!restaurant) return
    load()
  }, [restaurant])

  async function load() {
    setLoading(true)
    try {
      const rows = await sbGet('orders', {
        eq: { restaurant_id: restaurant.id },
        order: 'created_at.desc',
        limit: 12
      })
      setOrders(rows)
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  const paidOrders = orders.filter((order) => order.payment_status === 'paid')
  const grossRevenue = paidOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0)
  const openOrders = orders.filter((order) => ['pending', 'accepted', 'ready'].includes(order.status)).length
  const collectedOrders = orders.filter((order) => order.status === 'collected').length
  const primaryColor = restaurant?.primary_color || '#C9A84C'

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 500, margin: 0, fontFamily: "'Cormorant Garamond', serif" }}>
            {restaurant?.name}
          </h1>
          <p style={{ color: '#666', fontSize: 14, margin: '8px 0 0', maxWidth: 620 }}>
            Restaurant account overview with live order load, payment totals, and the links your team uses most.
          </p>
        </div>
        <Link
          to="/kitchen"
          style={{
            textDecoration: 'none',
            background: primaryColor,
            color: '#0a0a0a',
            borderRadius: 8,
            padding: '12px 16px',
            fontSize: 14,
            fontWeight: 600
          }}
        >
          Open kitchen screen
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <StatCard icon={Building2} label="Restaurant status" value={restaurant?.status || 'active'} sub={restaurant?.slug ? `/${restaurant.slug}` : 'Profile ready'} accent={primaryColor} />
        <StatCard icon={ShoppingBag} label="Open orders" value={openOrders} sub={`${collectedOrders} collected`} accent={primaryColor} />
        <StatCard icon={PoundSterling} label="Paid volume" value={`£${grossRevenue.toFixed(2)}`} sub={`${paidOrders.length} paid orders`} accent={primaryColor} />
        <StatCard icon={ChefHat} label="Busy mode" value={restaurant?.is_busy ? 'On' : 'Off'} sub={restaurant?.is_busy ? 'Customers paused' : 'Taking orders'} accent={primaryColor} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
        <section style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid #1e1e1e', color: '#888', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
            RECENT ORDERS
          </div>
          {loading ? (
            <div style={{ padding: 24, color: '#555' }}>Loading orders...</div>
          ) : orders.length === 0 ? (
            <div style={{ padding: 24, color: '#555' }}>No orders yet for this restaurant.</div>
          ) : (
            orders.slice(0, 8).map((order) => (
              <div key={order.id} style={{ padding: '14px 20px', borderTop: '1px solid #111', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>#{order.order_number}</div>
                  <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
                    {order.customer_name} · {order.collection_date} · {order.collection_time}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: primaryColor, fontWeight: 600, fontSize: 14 }}>£{Number(order.total).toFixed(2)}</div>
                  <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>{order.status}</div>
                </div>
              </div>
            ))
          )}
        </section>

        <section style={{ display: 'grid', gap: 16 }}>
          <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ color: '#888', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginBottom: 16 }}>RESTAURANT DETAILS</div>
            <Detail label="Contact email" value={restaurant?.email || 'Not set'} />
            <Detail label="Phone" value={restaurant?.phone || 'Not set'} />
            <Detail label="Address" value={restaurant?.address || 'Not set'} />
            <Detail label="Plan" value={restaurant?.plan || 'basic'} />
          </div>

          <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ color: '#888', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginBottom: 16 }}>NEXT ACTIONS</div>
            <ActionLink to="/dashboard/orders" label="Review order queue" />
            <ActionLink to="/dashboard/reports" label="Check payment totals" />
            <ActionLink to="/dashboard/hours" label="Update collection slots" />
            <ActionLink to="/dashboard/menu" label="Edit menu items" />
          </div>
        </section>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: '#666', fontSize: 12 }}>{label}</span>
        <Icon size={16} color={accent} />
      </div>
      <div style={{ color: '#fff', fontSize: 24, fontWeight: 600 }}>{value}</div>
      <div style={{ color: '#666', fontSize: 12, marginTop: 6 }}>{sub}</div>
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ color: '#666', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#fff', fontSize: 14 }}>{value}</div>
    </div>
  )
}

function ActionLink({ to, label }) {
  return (
    <Link
      to={to}
      style={{
        display: 'block',
        textDecoration: 'none',
        color: '#ddd',
        background: '#101010',
        border: '1px solid #202020',
        borderRadius: 8,
        padding: '12px 14px',
        fontSize: 13,
        marginBottom: 10
      }}
    >
      {label}
    </Link>
  )
}
