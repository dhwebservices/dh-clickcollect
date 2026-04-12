// src/pages/order/OrderConfirmation.jsx
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle, Clock, MapPin } from 'lucide-react'

export default function OrderConfirmation() {
  const { state } = useLocation()
  const { slug } = useParams()
  const navigate = useNavigate()

  const order = state?.order
  const restaurant = state?.restaurant

  if (!order) {
    navigate(`/order/${slug}`)
    return null
  }

  const primary = restaurant?.primary_color || '#C9A84C'
  const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]')

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', fontFamily: "'Outfit', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Outfit:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: `${primary}20`,
          border: `2px solid ${primary}60`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px'
        }}>
          <CheckCircle size={36} color={primary} />
        </div>

        <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 400, fontFamily: "'Cormorant Garamond', serif", margin: '0 0 8px' }}>
          Order confirmed!
        </h1>
        <p style={{ color: '#666', margin: '0 0 32px', fontSize: 15 }}>
          {order.customer_email ? `Confirmation sent to ${order.customer_email}` : 'Your order is in.'}
        </p>

        <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 16, padding: '24px', textAlign: 'left', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #1e1e1e' }}>
            <div>
              <div style={{ color: '#888', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>ORDER NUMBER</div>
              <div style={{ color: primary, fontSize: 22, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                #{order.order_number}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#888', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>RESTAURANT</div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{restaurant?.name}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <div style={{ flex: 1, background: '#0f0f0f', borderRadius: 8, padding: '12px', display: 'flex', gap: 8, alignItems: 'center' }}>
              <Clock size={16} color={primary} />
              <div>
                <div style={{ color: '#666', fontSize: 11 }}>Collection time</div>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>{order.collection_time}</div>
              </div>
            </div>
            {restaurant?.address && (
              <div style={{ flex: 1, background: '#0f0f0f', borderRadius: 8, padding: '12px', display: 'flex', gap: 8, alignItems: 'center' }}>
                <MapPin size={16} color={primary} />
                <div>
                  <div style={{ color: '#666', fontSize: 11 }}>Address</div>
                  <div style={{ color: '#fff', fontSize: 12, lineHeight: 1.4 }}>{restaurant.address}</div>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ color: '#666', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginBottom: 10 }}>YOUR ORDER</div>
            {items.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 14 }}>
                <span style={{ color: '#aaa' }}>×{item.quantity} {item.name}</span>
                <span style={{ color: '#888' }}>£{(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #1e1e1e', paddingTop: 12, display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
            <span style={{ color: '#fff' }}>Total paid</span>
            <span style={{ color: primary, fontSize: 18 }}>£{Number(order.total).toFixed(2)}</span>
          </div>
        </div>

        <button
          onClick={() => navigate(`/order/${slug}`)}
          style={{
            background: 'transparent', border: `1px solid #222`,
            color: '#666', borderRadius: 10, padding: '12px 28px',
            fontSize: 14, cursor: 'pointer', fontFamily: "'Outfit', sans-serif"
          }}
        >
          Order again
        </button>
      </div>
    </div>
  )
}
