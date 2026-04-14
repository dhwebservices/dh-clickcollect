// src/pages/dashboard/LiveOrders.jsx
// Real-time orders via Supabase Realtime — the most critical feature
import { useEffect, useState, useRef } from 'react'
import { useRestaurant } from '../../contexts/RestaurantContext'
import { sbGet, sbUpdate, sbRpc, supabaseRealtime } from '../../lib/supabase'
import { CheckCircle, XCircle, Clock, Package, AlertCircle, WifiOff, Wifi } from 'lucide-react'

const STATUS_CONFIG = {
  pending:   { label: 'New Order', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', icon: Clock },
  accepted:  { label: 'Accepted',  color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', icon: CheckCircle },
  ready:     { label: 'Ready',     color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)',  icon: Package },
  rejected:  { label: 'Rejected',  color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.3)',  icon: XCircle },
  collected: { label: 'Collected', color: '#666',    bg: 'rgba(100,100,100,0.1)', border: 'rgba(100,100,100,0.3)', icon: CheckCircle }
}

export default function LiveOrders() {
  const { restaurant, refreshRestaurant } = useRestaurant()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [connected, setConnected] = useState(false)
  const [busyLoading, setBusyLoading] = useState(false)
  const [filter, setFilter] = useState('active') // active | all
  const [creatingOrder, setCreatingOrder] = useState(false)
  const [manualOrderMessage, setManualOrderMessage] = useState('')
  const [manualOrderError, setManualOrderError] = useState('')
  const [manualOrder, setManualOrder] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    itemName: 'Manual test order',
    quantity: 1,
    total: '12.50',
    collectionTime: defaultCollectionTime(),
    notes: 'Admin test order',
  })
  const channelRef = useRef(null)
  const audioRef = useRef(null)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (!restaurant) return
    loadOrders()
    if (restaurant.impersonatedByAdmin) {
      const interval = window.setInterval(loadOrders, 10000)
      return () => window.clearInterval(interval)
    }
    subscribeToOrders()
    return () => {
      if (channelRef.current) {
        supabaseRealtime.removeChannel(channelRef.current)
      }
    }
  }, [restaurant])

  async function loadOrders() {
    setLoading(true)
    setError(null)
    try {
      const rows = await sbGet('orders', {
        eq: { restaurant_id: restaurant.id },
        filter: { collection_date: `gte.${today}` },
        order: 'created_at.desc'
      })
      setOrders(rows)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function subscribeToOrders() {
    const channel = supabaseRealtime
      .channel(`orders:${restaurant.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'orders',
        filter: `restaurant_id=eq.${restaurant.id}`
      }, (payload) => {
        setOrders(prev => [payload.new, ...prev])
        playNotification()
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `restaurant_id=eq.${restaurant.id}`
      }, (payload) => {
        setOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new : o))
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED')
      })

    channelRef.current = channel
  }

  function playNotification() {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.4)
    } catch (e) {}
  }

  async function updateOrderStatus(orderId, status) {
    try {
      await sbUpdate('orders', { id: orderId }, { status })
      const updatedOrder = orders.find((order) => order.id === orderId)
      const nextOrder = updatedOrder ? { ...updatedOrder, status } : null
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o))
      if (nextOrder && ['accepted', 'ready', 'rejected', 'collected'].includes(status)) {
        sendStatusNotification(nextOrder)
      }
    } catch (err) {
      alert('Failed to update order: ' + err.message)
    }
  }

  function sendStatusNotification(order) {
    if (!import.meta.env.VITE_WORKER_URL) return
    fetch(`${import.meta.env.VITE_WORKER_URL}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'order_status_update',
        order,
        restaurant,
        customer: {
          name: order.customer_name,
          email: order.customer_email,
          phone: order.customer_phone,
        },
      }),
    }).catch(() => {})
  }

  async function toggleBusy() {
    if (!restaurant) return
    setBusyLoading(true)
    try {
      const newBusy = !restaurant.is_busy
      await sbUpdate('restaurants', { id: restaurant.id }, {
        is_busy: newBusy,
        busy_until: newBusy ? new Date(Date.now() + 30 * 60000).toISOString() : null
      })
      await refreshRestaurant()
    } catch (err) {
      alert('Failed to update busy mode: ' + err.message)
    } finally {
      setBusyLoading(false)
    }
  }

  async function createManualOrder(event) {
    event.preventDefault()
    if (!restaurant?.impersonatedByAdmin) return

    setCreatingOrder(true)
    setManualOrderError('')
    setManualOrderMessage('')

    try {
      if (!manualOrder.customerName.trim()) throw new Error('Customer name is required')
      if (!manualOrder.collectionTime.trim()) throw new Error('Collection time is required')

      const total = Number(manualOrder.total)
      const quantity = Math.max(1, Number(manualOrder.quantity) || 1)
      if (!Number.isFinite(total) || total <= 0) throw new Error('Enter a valid total')

      const orderNumber = await sbRpc('generate_order_number', { p_restaurant_id: restaurant.id })
      const order = await sbInsert('orders', {
        restaurant_id: restaurant.id,
        order_number: orderNumber,
        customer_name: manualOrder.customerName.trim(),
        customer_email: manualOrder.customerEmail.trim() || null,
        customer_phone: manualOrder.customerPhone.trim() || null,
        items: JSON.stringify([{
          name: manualOrder.itemName.trim() || 'Manual test order',
          quantity,
          price: total / quantity,
          options: { source: 'Admin manual test' },
        }]),
        subtotal: total,
        commission_amount: total * (Number(restaurant.commission_rate || 0) / 100),
        total,
        collection_time: manualOrder.collectionTime.trim(),
        collection_date: today,
        status: 'pending',
        payment_method: 'pay_on_collection',
        payment_status: 'paid',
        notes: manualOrder.notes.trim() || null,
      })

      setOrders((prev) => [order, ...prev])
      playNotification()

      if (import.meta.env.VITE_WORKER_URL) {
        fetch(`${import.meta.env.VITE_WORKER_URL}/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'order_confirmation',
            order,
            restaurant,
            customer: {
              name: manualOrder.customerName.trim(),
              email: manualOrder.customerEmail.trim() || null,
              phone: manualOrder.customerPhone.trim() || null,
            },
          }),
        }).catch(() => {})
      }

      setManualOrderMessage(`Manual order #${order.order_number} created.`)
      setManualOrder({
        customerName: '',
        customerEmail: '',
        customerPhone: '',
        itemName: 'Manual test order',
        quantity: 1,
        total: '12.50',
        collectionTime: defaultCollectionTime(),
        notes: 'Admin test order',
      })
    } catch (err) {
      setManualOrderError(err.message || 'Could not create manual order')
    } finally {
      setCreatingOrder(false)
    }
  }

  const visibleOrders = filter === 'active'
    ? orders.filter(o => !['collected', 'rejected'].includes(o.status))
    : orders

  const pendingCount = orders.filter(o => o.status === 'pending').length

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={loadOrders} />

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 500, margin: 0, fontFamily: "'Cormorant Garamond', serif" }}>
            Live Orders
            {pendingCount > 0 && (
              <span style={{
                marginLeft: 10,
                background: '#f59e0b',
                color: '#0a0a0a',
                fontSize: 13,
                fontWeight: 600,
                padding: '2px 10px',
                borderRadius: 20,
                fontFamily: "'Outfit', sans-serif"
              }}>
                {pendingCount} new
              </span>
            )}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            {connected
              ? <><Wifi size={12} color="#22c55e" /><span style={{ color: '#22c55e', fontSize: 12 }}>Live updates on</span></>
              : <><WifiOff size={12} color="#ef4444" /><span style={{ color: '#ef4444', fontSize: 12 }}>Reconnecting...</span></>
            }
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {/* Busy toggle */}
          <button
            onClick={toggleBusy}
            disabled={busyLoading}
            style={{
              background: restaurant?.is_busy ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.1)',
              border: `1px solid ${restaurant?.is_busy ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.3)'}`,
              color: restaurant?.is_busy ? '#ef4444' : '#22c55e',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              cursor: busyLoading ? 'not-allowed' : 'pointer',
              fontFamily: "'Outfit', sans-serif"
            }}
          >
            {busyLoading ? '...' : restaurant?.is_busy ? 'Disable Busy Mode' : 'Enable Busy Mode'}
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[['active', 'Active'], ['all', 'All today']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            style={{
              background: filter === val ? '#C9A84C' : 'transparent',
              color: filter === val ? '#0a0a0a' : '#666',
              border: `1px solid ${filter === val ? '#C9A84C' : '#222'}`,
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: "'Outfit', sans-serif"
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {restaurant?.impersonatedByAdmin ? (
        <div style={{
          background: '#141414',
          border: '1px solid #1e1e1e',
          borderRadius: 12,
          padding: 18,
          marginBottom: 20,
          display: 'grid',
          gap: 14,
        }}>
          <div>
            <div style={{ color: '#C9A84C', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>ADMIN TESTING</div>
            <div style={{ color: '#fff', fontSize: 17, fontWeight: 600 }}>Add manual order</div>
            <div style={{ color: '#666', fontSize: 13, marginTop: 6 }}>Creates a live pending order here and triggers the normal confirmation notification flow.</div>
          </div>

          {manualOrderError ? <InlineBanner tone="danger" message={manualOrderError} /> : null}
          {manualOrderMessage ? <InlineBanner tone="success" message={manualOrderMessage} /> : null}

          <form onSubmit={createManualOrder} style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              <input value={manualOrder.customerName} onChange={(e) => setManualOrder((current) => ({ ...current, customerName: e.target.value }))} style={adminInput} placeholder="Customer name" />
              <input value={manualOrder.customerEmail} onChange={(e) => setManualOrder((current) => ({ ...current, customerEmail: e.target.value }))} style={adminInput} placeholder="Customer email" />
              <input value={manualOrder.customerPhone} onChange={(e) => setManualOrder((current) => ({ ...current, customerPhone: e.target.value }))} style={adminInput} placeholder="Customer phone" />
              <input value={manualOrder.itemName} onChange={(e) => setManualOrder((current) => ({ ...current, itemName: e.target.value }))} style={adminInput} placeholder="Item" />
              <input type="number" min="1" value={manualOrder.quantity} onChange={(e) => setManualOrder((current) => ({ ...current, quantity: Number(e.target.value) || 1 }))} style={adminInput} placeholder="Qty" />
              <input type="number" min="0.01" step="0.01" value={manualOrder.total} onChange={(e) => setManualOrder((current) => ({ ...current, total: e.target.value }))} style={adminInput} placeholder="Total" />
              <input value={manualOrder.collectionTime} onChange={(e) => setManualOrder((current) => ({ ...current, collectionTime: e.target.value }))} style={adminInput} placeholder="Collection time" />
              <input value={manualOrder.notes} onChange={(e) => setManualOrder((current) => ({ ...current, notes: e.target.value }))} style={{ ...adminInput, gridColumn: 'span 2' }} placeholder="Notes" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={creatingOrder}
                style={{
                  background: '#C9A84C',
                  color: '#0a0a0a',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: creatingOrder ? 'not-allowed' : 'pointer',
                  fontFamily: "'Outfit', sans-serif"
                }}
              >
                {creatingOrder ? 'Creating...' : 'Add manual order'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Orders grid */}
      {visibleOrders.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          color: '#444',
          border: '1px dashed #222',
          borderRadius: 12
        }}>
          <Clock size={40} color="#333" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 16, color: '#555', marginBottom: 8 }}>No orders yet today</div>
          <div style={{ fontSize: 13, color: '#444' }}>Orders will appear here instantly when placed</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {visibleOrders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onUpdateStatus={updateOrderStatus}
              primaryColor={restaurant?.primary_color || '#C9A84C'}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function defaultCollectionTime() {
  const next = new Date(Date.now() + 30 * 60000)
  return `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`
}

function InlineBanner({ tone, message }) {
  const styles = tone === 'success'
    ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac' }
    : { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }

  return (
    <div style={{ ...styles, borderRadius: 10, padding: '11px 14px', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
      <AlertCircle size={14} />
      <span>{message}</span>
    </div>
  )
}

const adminInput = {
  width: '100%',
  background: '#0f0f0f',
  border: '1px solid #2a2a2a',
  borderRadius: 8,
  padding: '10px 12px',
  color: '#fff',
  fontSize: 13,
  boxSizing: 'border-box',
  fontFamily: "'Outfit', sans-serif"
}

function OrderCard({ order, onUpdateStatus, primaryColor }) {
  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
  const StatusIcon = cfg.icon
  const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]')

  return (
    <div style={{
      background: '#141414',
      border: `1px solid ${order.status === 'pending' ? 'rgba(245,158,11,0.4)' : '#1e1e1e'}`,
      borderRadius: 12,
      overflow: 'hidden',
      animation: order.status === 'pending' ? 'pulse-border 2s ease-in-out infinite' : 'none'
    }}>
      <style>{`
        @keyframes pulse-border {
          0%, 100% { border-color: rgba(245,158,11,0.4); }
          50% { border-color: rgba(245,158,11,0.8); }
        }
      `}</style>

      {/* Card header */}
      <div style={{
        padding: '14px 16px',
        background: cfg.bg,
        borderBottom: `1px solid ${cfg.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>
            #{order.order_number}
          </div>
          <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
            {new Date(order.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: cfg.bg,
          border: `1px solid ${cfg.border}`,
          borderRadius: 20,
          padding: '4px 10px'
        }}>
          <StatusIcon size={13} color={cfg.color} />
          <span style={{ color: cfg.color, fontSize: 12, fontWeight: 500 }}>{cfg.label}</span>
        </div>
      </div>

      {/* Customer info */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #1a1a1a' }}>
        <div style={{ color: '#fff', fontWeight: 500, marginBottom: 4 }}>{order.customer_name}</div>
        <div style={{ color: '#666', fontSize: 13 }}>
          Collect: <span style={{ color: '#aaa' }}>{order.collection_time}</span>
          {order.customer_phone && <span style={{ marginLeft: 12 }}>📞 {order.customer_phone}</span>}
        </div>
        {order.notes && (
          <div style={{
            marginTop: 8,
            background: 'rgba(201,168,76,0.08)',
            border: '1px solid rgba(201,168,76,0.2)',
            borderRadius: 6,
            padding: '6px 10px',
            color: '#C9A84C',
            fontSize: 12
          }}>
            Note: {order.notes}
          </div>
        )}
      </div>

      {/* Items */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1a1a1a' }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 14 }}>
            <span style={{ color: '#ccc' }}>
              <span style={{ color: '#888', marginRight: 6 }}>×{item.quantity}</span>
              {item.name}
              {item.options && Object.values(item.options).length > 0 && (
                <span style={{ color: '#555', fontSize: 12, display: 'block', paddingLeft: 20 }}>
                  {Object.values(item.options).join(', ')}
                </span>
              )}
            </span>
            <span style={{ color: '#888' }}>£{(item.price * item.quantity).toFixed(2)}</span>
          </div>
        ))}
        <div style={{
          borderTop: '1px solid #1e1e1e',
          marginTop: 8,
          paddingTop: 8,
          display: 'flex',
          justifyContent: 'space-between',
          fontWeight: 600
        }}>
          <span style={{ color: '#aaa' }}>Total</span>
          <span style={{ color: primaryColor, fontSize: 16 }}>£{order.total.toFixed(2)}</span>
        </div>
      </div>

      {/* Action buttons */}
      {order.status === 'pending' && (
        <div style={{ padding: '12px 16px', display: 'flex', gap: 8 }}>
          <button
            onClick={() => onUpdateStatus(order.id, 'accepted')}
            style={{
              flex: 1,
              background: 'rgba(34,197,94,0.15)',
              border: '1px solid rgba(34,197,94,0.3)',
              color: '#22c55e',
              borderRadius: 8,
              padding: '10px',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: "'Outfit', sans-serif"
            }}
          >
            Accept
          </button>
          <button
            onClick={() => onUpdateStatus(order.id, 'rejected')}
            style={{
              flex: 1,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#ef4444',
              borderRadius: 8,
              padding: '10px',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: "'Outfit', sans-serif"
            }}
          >
            Reject
          </button>
        </div>
      )}

      {order.status === 'accepted' && (
        <div style={{ padding: '12px 16px' }}>
          <button
            onClick={() => onUpdateStatus(order.id, 'ready')}
            style={{
              width: '100%',
              background: 'rgba(59,130,246,0.15)',
              border: '1px solid rgba(59,130,246,0.3)',
              color: '#3b82f6',
              borderRadius: 8,
              padding: '10px',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: "'Outfit', sans-serif"
            }}
          >
            Mark as Ready
          </button>
        </div>
      )}

      {order.status === 'ready' && (
        <div style={{ padding: '12px 16px' }}>
          <button
            onClick={() => onUpdateStatus(order.id, 'collected')}
            style={{
              width: '100%',
              background: 'rgba(100,100,100,0.15)',
              border: '1px solid #333',
              color: '#888',
              borderRadius: 8,
              padding: '10px',
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: "'Outfit', sans-serif"
            }}
          >
            Mark Collected
          </button>
        </div>
      )}
    </div>
  )
}

function LoadingState() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{
        width: 32, height: 32,
        border: '2px solid #222',
        borderTop: '2px solid #C9A84C',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite'
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <AlertCircle size={40} color="#ef4444" style={{ marginBottom: 16 }} />
      <div style={{ color: '#ef4444', marginBottom: 12 }}>{message}</div>
      <button onClick={onRetry} style={{ color: '#C9A84C', background: 'none', border: '1px solid #C9A84C', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}>
        Retry
      </button>
    </div>
  )
}
