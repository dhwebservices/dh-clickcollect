// src/pages/dashboard/KitchenView.jsx
// Fullscreen kitchen display — tablet optimised, real-time Supabase
import { useEffect, useState, useRef } from 'react'
import { useRestaurant } from '../../contexts/RestaurantContext'
import { sbGet, sbUpdate, supabaseRealtime } from '../../lib/supabase'
import { Maximize2, Minimize2 } from 'lucide-react'

const today = new Date().toISOString().split('T')[0]

export default function KitchenView() {
  const { restaurant } = useRestaurant()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const channelRef = useRef(null)

  useEffect(() => {
    if (!restaurant) return
    loadOrders()
    if (restaurant.impersonatedByAdmin) {
      const interval = window.setInterval(loadOrders, 10000)
      return () => window.clearInterval(interval)
    }
    subscribeToOrders()
    return () => { if (channelRef.current) supabaseRealtime.removeChannel(channelRef.current) }
  }, [restaurant])

  async function loadOrders() {
    setLoading(true)
    try {
      const rows = await sbGet('orders', {
        eq: { restaurant_id: restaurant.id },
        filter: {
          collection_date: `eq.${today}`,
          status: 'in.(pending,accepted)'
        },
        order: 'created_at.asc'
      })
      setOrders(rows)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  function subscribeToOrders() {
    const channel = supabaseRealtime
      .channel(`kitchen:${restaurant.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurant.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            if (['pending', 'accepted'].includes(payload.new.status)) {
              setOrders(prev => [payload.new, ...prev])
              playBell()
            }
          } else if (payload.eventType === 'UPDATE') {
            if (['pending', 'accepted'].includes(payload.new.status)) {
              setOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new : o))
            } else {
              setOrders(prev => prev.filter(o => o.id !== payload.new.id))
            }
          }
        })
      .subscribe()
    channelRef.current = channel
  }

  function playBell() {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(1047, ctx.currentTime)
      osc.frequency.setValueAtTime(1319, ctx.currentTime + 0.1)
      osc.frequency.setValueAtTime(1047, ctx.currentTime + 0.2)
      gain.gain.setValueAtTime(0.4, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6)
    } catch (e) {}
  }

  async function markReady(id) {
    try {
      await sbUpdate('orders', { id }, { status: 'ready' })
      setOrders(prev => prev.filter(o => o.id !== id))
    } catch (err) { console.error(err) }
  }

  async function acceptOrder(id) {
    try {
      await sbUpdate('orders', { id }, { status: 'accepted' })
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'accepted' } : o))
    } catch (err) { console.error(err) }
  }

  function toggleFullscreen() {
    if (!fullscreen) {
      document.documentElement.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
    setFullscreen(!fullscreen)
  }

  const primary = restaurant?.primary_color || '#C9A84C'
  const pending = orders.filter(o => o.status === 'pending')
  const accepted = orders.filter(o => o.status === 'accepted')

  return (
    <div style={{
      minHeight: '100vh',
      background: '#050505',
      fontFamily: "'Outfit', sans-serif",
      padding: '16px'
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <span style={{ color: primary, fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700 }}>
            {restaurant?.name}
          </span>
          <span style={{ color: '#444', fontSize: 13, marginLeft: 12, fontFamily: "'JetBrains Mono', monospace" }}>
            KITCHEN · {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <button onClick={toggleFullscreen} style={{ background: '#111', border: '1px solid #222', color: '#666', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div style={{ width: 36, height: 36, border: '3px solid #111', borderTop: `3px solid ${primary}`, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Pending column */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', animation: 'pulse 1.5s ease-in-out infinite' }} />
              <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: 14, letterSpacing: '0.06em' }}>NEW ORDERS</span>
              {pending.length > 0 && (
                <span style={{ background: '#f59e0b', color: '#000', borderRadius: 20, padding: '1px 8px', fontSize: 12, fontWeight: 700 }}>{pending.length}</span>
              )}
            </div>
            <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>

            <div style={{ display: 'grid', gap: 12 }}>
              {pending.length === 0 ? (
                <div style={{ color: '#333', fontSize: 14, padding: '40px 20px', textAlign: 'center', border: '1px dashed #1a1a1a', borderRadius: 12 }}>
                  No new orders
                </div>
              ) : pending.map(order => (
                <KitchenCard key={order.id} order={order} primaryColor={primary}
                  onAction={() => acceptOrder(order.id)}
                  actionLabel="Accept"
                  actionColor="#f59e0b"
                />
              ))}
            </div>
          </div>

          {/* In progress column */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6' }} />
              <span style={{ color: '#3b82f6', fontWeight: 600, fontSize: 14, letterSpacing: '0.06em' }}>IN PROGRESS</span>
              {accepted.length > 0 && (
                <span style={{ background: '#3b82f6', color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 12, fontWeight: 700 }}>{accepted.length}</span>
              )}
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {accepted.length === 0 ? (
                <div style={{ color: '#333', fontSize: 14, padding: '40px 20px', textAlign: 'center', border: '1px dashed #1a1a1a', borderRadius: 12 }}>
                  Nothing in progress
                </div>
              ) : accepted.map(order => (
                <KitchenCard key={order.id} order={order} primaryColor={primary}
                  onAction={() => markReady(order.id)}
                  actionLabel="Ready for collection"
                  actionColor="#22c55e"
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KitchenCard({ order, primaryColor, onAction, actionLabel, actionColor }) {
  const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]')

  const elapsed = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)
  const urgent = elapsed > 10

  return (
    <div style={{
      background: '#111',
      border: `1px solid ${urgent ? 'rgba(239,68,68,0.5)' : '#1e1e1e'}`,
      borderRadius: 14,
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        background: urgent ? 'rgba(239,68,68,0.08)' : '#161616',
        borderBottom: '1px solid #1a1a1a',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 20, fontFamily: "'JetBrains Mono', monospace" }}>
            #{order.order_number}
          </div>
          <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}>
            {order.customer_name} · Collect {order.collection_time}
          </div>
        </div>
        <div style={{
          color: urgent ? '#ef4444' : '#888',
          fontSize: 13,
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: urgent ? 700 : 400
        }}>
          {elapsed}m ago
        </div>
      </div>

      {/* Items */}
      <div style={{ padding: '14px 16px' }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
            <span style={{
              background: primaryColor,
              color: '#0a0a0a',
              borderRadius: 6,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
              flexShrink: 0
            }}>
              {item.quantity}
            </span>
            <div>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>{item.name}</div>
              {item.options && Object.values(item.options).length > 0 && (
                <div style={{ color: '#888', fontSize: 13 }}>{Object.values(item.options).join(', ')}</div>
              )}
            </div>
          </div>
        ))}
        {order.notes && (
          <div style={{
            marginTop: 8, background: 'rgba(201,168,76,0.08)',
            border: '1px solid rgba(201,168,76,0.2)',
            borderRadius: 8, padding: '8px 12px',
            color: '#C9A84C', fontSize: 13
          }}>
            ⚠ {order.notes}
          </div>
        )}
      </div>

      {/* Action */}
      <div style={{ padding: '0 16px 16px' }}>
        <button
          onClick={onAction}
          style={{
            width: '100%',
            background: `${actionColor}20`,
            border: `1px solid ${actionColor}50`,
            color: actionColor,
            borderRadius: 10,
            padding: '14px',
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: "'Outfit', sans-serif",
            letterSpacing: '0.02em'
          }}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}
