// src/pages/dashboard/Reports.jsx
import { useEffect, useState } from 'react'
import { useRestaurant } from '../../contexts/RestaurantContext'
import { sbGet } from '../../lib/supabase'
import { TrendingUp, ShoppingBag, Clock, Star } from 'lucide-react'

export default function Reports() {
  const { restaurant } = useRestaurant()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('7') // days

  useEffect(() => {
    if (!restaurant) return
    load()
  }, [restaurant, period])

  async function load() {
    setLoading(true)
    try {
      const from = new Date()
      from.setDate(from.getDate() - parseInt(period))
      const rows = await sbGet('orders', {
        eq: { restaurant_id: restaurant.id },
        filter: {
          created_at: `gte.${from.toISOString()}`,
          status: 'not.in.(rejected)'
        },
        order: 'created_at.desc'
      })
      setOrders(rows)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const revenue = orders.reduce((s, o) => s + Number(o.total), 0)
  const avgOrder = orders.length ? revenue / orders.length : 0

  // Popular items
  const itemCounts = {}
  orders.forEach(o => {
    const items = Array.isArray(o.items) ? o.items : JSON.parse(o.items || '[]')
    items.forEach(item => {
      itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity
    })
  })
  const popularItems = Object.entries(itemCounts).sort(([,a],[,b]) => b - a).slice(0, 5)

  // Orders by day
  const byDay = {}
  orders.forEach(o => {
    const day = o.collection_date
    byDay[day] = (byDay[day] || 0) + 1
  })

  // Peak times
  const byTime = {}
  orders.forEach(o => {
    byTime[o.collection_time] = (byTime[o.collection_time] || 0) + 1
  })
  const peakTime = Object.entries(byTime).sort(([,a],[,b]) => b - a)[0]

  const primary = restaurant?.primary_color || '#C9A84C'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 500, margin: 0, fontFamily: "'Cormorant Garamond', serif" }}>Reports</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['7', '7 days'], ['30', '30 days'], ['90', '3 months']].map(([val, label]) => (
            <button key={val} onClick={() => setPeriod(val)} style={{
              background: period === val ? primary : 'transparent',
              color: period === val ? '#0a0a0a' : '#666',
              border: `1px solid ${period === val ? primary : '#222'}`,
              borderRadius: 6, padding: '6px 12px', fontSize: 12,
              cursor: 'pointer', fontFamily: "'Outfit', sans-serif"
            }}>{label}</button>
          ))}
        </div>
      </div>

      {loading ? <Loader /> : (
        <>
          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 28 }}>
            <StatCard icon={TrendingUp} label="Revenue" value={`£${revenue.toFixed(2)}`} gold primary={primary} />
            <StatCard icon={ShoppingBag} label="Total orders" value={orders.length} primary={primary} />
            <StatCard icon={Star} label="Avg order value" value={`£${avgOrder.toFixed(2)}`} primary={primary} />
            <StatCard icon={Clock} label="Peak time" value={peakTime?.[0] || '—'} primary={primary} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Popular items */}
            <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, padding: '20px' }}>
              <div style={{ color: '#888', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginBottom: 16 }}>TOP ITEMS</div>
              {popularItems.length === 0 ? (
                <div style={{ color: '#444', fontSize: 13 }}>No data yet</div>
              ) : popularItems.map(([name, count], i) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: '#444', fontSize: 12, width: 16 }}>{i + 1}</span>
                    <span style={{ color: '#ccc', fontSize: 14 }}>{name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 80, height: 4, background: '#1a1a1a', borderRadius: 2 }}>
                      <div style={{ width: `${(count / popularItems[0][1]) * 100}%`, height: '100%', background: primary, borderRadius: 2 }} />
                    </div>
                    <span style={{ color: '#666', fontSize: 13, width: 24, textAlign: 'right' }}>{count}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Recent orders */}
            <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '20px 20px 14px', color: '#888', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>RECENT ORDERS</div>
              {orders.slice(0, 8).map((order, i) => (
                <div key={order.id} style={{
                  padding: '10px 20px',
                  borderTop: '1px solid #111',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <span style={{ color: '#fff', fontSize: 13 }}>#{order.order_number}</span>
                    <span style={{ color: '#555', fontSize: 12, marginLeft: 8 }}>{order.customer_name}</span>
                  </div>
                  <span style={{ color: primary, fontSize: 13, fontWeight: 600 }}>£{Number(order.total).toFixed(2)}</span>
                </div>
              ))}
              {orders.length === 0 && (
                <div style={{ padding: '24px 20px', color: '#444', fontSize: 13 }}>No orders in this period.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, gold, primary }) {
  return (
    <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 10, padding: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ color: '#555', fontSize: 12 }}>{label}</span>
        <Icon size={15} color={gold ? primary : '#333'} />
      </div>
      <div style={{ color: gold ? primary : '#fff', fontSize: 24, fontWeight: 600, fontFamily: gold ? "'Cormorant Garamond', serif" : "'Outfit', sans-serif" }}>
        {value}
      </div>
    </div>
  )
}

function Loader() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><div style={{ width: 28, height: 28, border: '2px solid #222', borderTop: '2px solid #C9A84C', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>
}
