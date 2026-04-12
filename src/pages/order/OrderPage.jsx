// src/pages/order/OrderPage.jsx
// Customer-facing ordering page — loads real menu data by restaurant slug
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { sbGetOne, sbGet } from '../../lib/supabase'
import { ShoppingBag, Plus, Minus, X, ChevronRight, WifiOff } from 'lucide-react'

export default function OrderPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [restaurant, setRestaurant] = useState(null)
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [basket, setBasket] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeCategory, setActiveCategory] = useState(null)

  useEffect(() => { loadMenu() }, [slug])

  async function loadMenu() {
    setLoading(true)
    setError(null)
    try {
      const r = await sbGetOne('restaurants', { eq: { slug, status: 'active' } })
      if (!r) { setError('Restaurant not found or not taking orders.'); setLoading(false); return }
      if (r.is_busy) { setError('This restaurant is currently busy and not taking new orders. Please try again shortly.'); setLoading(false); return }

      const [cats, menuItems] = await Promise.all([
        sbGet('menu_categories', { eq: { restaurant_id: r.id }, filter: { is_active: 'eq.true' }, order: 'sort_order.asc' }),
        sbGet('menu_items', { eq: { restaurant_id: r.id }, filter: { is_available: 'eq.true' }, order: 'sort_order.asc' })
      ])

      setRestaurant(r)
      setCategories(cats)
      setItems(menuItems)
      if (cats.length > 0) setActiveCategory(cats[0].id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function addToBasket(item, selectedOptions = {}) {
    setBasket(prev => {
      const key = item.id + JSON.stringify(selectedOptions)
      const existing = prev.find(b => b.key === key)
      if (existing) {
        return prev.map(b => b.key === key ? { ...b, quantity: b.quantity + 1 } : b)
      }
      return [...prev, { key, item, quantity: 1, selectedOptions, price: item.price }]
    })
  }

  function removeFromBasket(key) {
    setBasket(prev => {
      const existing = prev.find(b => b.key === key)
      if (!existing) return prev
      if (existing.quantity <= 1) return prev.filter(b => b.key !== key)
      return prev.map(b => b.key === key ? { ...b, quantity: b.quantity - 1 } : b)
    })
  }

  function clearBasket() { setBasket([]) }

  const basketTotal = basket.reduce((sum, b) => sum + b.price * b.quantity, 0)
  const basketCount = basket.reduce((sum, b) => sum + b.quantity, 0)
  const primary = restaurant?.primary_color || '#C9A84C'

  function goToCheckout() {
    navigate(`/order/${slug}/checkout`, { state: { basket, restaurant } })
  }

  if (loading) return <LoadingPage />
  if (error) return <ErrorPage message={error} restaurant={restaurant} />

  const filteredItems = activeCategory ? items.filter(i => i.category_id === activeCategory) : items

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', fontFamily: "'Outfit', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Outfit:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        background: '#111',
        borderBottom: '1px solid #1e1e1e',
        padding: '20px 24px',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, color: primary }}>
              {restaurant.name}
            </div>
            {restaurant.address && (
              <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}>{restaurant.address}</div>
            )}
          </div>
          {basketCount > 0 && (
            <button
              onClick={goToCheckout}
              style={{
                background: primary,
                color: '#0a0a0a',
                border: 'none',
                borderRadius: 10,
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: "'Outfit', sans-serif"
              }}
            >
              <ShoppingBag size={16} />
              {basketCount} item{basketCount > 1 ? 's' : ''} · £{basketTotal.toFixed(2)}
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px' }}>
        {/* Category tabs */}
        {categories.length > 0 && (
          <div style={{
            display: 'flex',
            gap: 6,
            padding: '16px 0',
            overflowX: 'auto',
            position: 'sticky',
            top: 73,
            background: '#0a0a0a',
            zIndex: 40,
            borderBottom: '1px solid #1a1a1a',
            marginBottom: 24
          }}>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  background: activeCategory === cat.id ? primary : 'transparent',
                  color: activeCategory === cat.id ? '#0a0a0a' : '#666',
                  border: `1px solid ${activeCategory === cat.id ? primary : '#222'}`,
                  borderRadius: 20,
                  padding: '6px 16px',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontFamily: "'Outfit', sans-serif",
                  transition: 'all 0.15s'
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Menu items grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, paddingBottom: 100 }}>
          {filteredItems.map(item => (
            <MenuItemCard
              key={item.id}
              item={item}
              basket={basket}
              onAdd={() => addToBasket(item)}
              onRemove={() => removeFromBasket(item.id + '{}')}
              primaryColor={primary}
            />
          ))}
        </div>

        {filteredItems.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#555' }}>
            No items available in this category.
          </div>
        )}
      </div>

      {/* Fixed basket bar */}
      {basketCount > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#111',
          borderTop: '1px solid #1e1e1e',
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 60
        }}>
          <div style={{ color: '#888', fontSize: 14 }}>
            {basketCount} item{basketCount > 1 ? 's' : ''} in basket
          </div>
          <button
            onClick={goToCheckout}
            style={{
              background: primary,
              color: '#0a0a0a',
              border: 'none',
              borderRadius: 10,
              padding: '12px 28px',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'Outfit', sans-serif",
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            View basket · £{basketTotal.toFixed(2)}
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

function MenuItemCard({ item, basket, onAdd, onRemove, primaryColor }) {
  const basketEntry = basket.find(b => b.item.id === item.id)
  const qty = basketEntry?.quantity || 0

  return (
    <div style={{
      background: '#141414',
      border: '1px solid #1e1e1e',
      borderRadius: 12,
      overflow: 'hidden',
      transition: 'border-color 0.15s'
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = '#2a2a2a'}
    onMouseLeave={e => e.currentTarget.style.borderColor = '#1e1e1e'}
    >
      {item.image_url && (
        <div style={{ height: 140, overflow: 'hidden', background: '#1a1a1a' }}>
          <img
            src={item.image_url}
            alt={item.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
          />
        </div>
      )}
      <div style={{ padding: '14px' }}>
        <div style={{ color: '#fff', fontWeight: 500, marginBottom: 4, fontSize: 15 }}>{item.name}</div>
        {item.description && (
          <div style={{ color: '#666', fontSize: 13, marginBottom: 10, lineHeight: 1.4 }}>{item.description}</div>
        )}
        {item.allergens?.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {item.allergens.map(a => (
              <span key={a} style={{
                fontSize: 10, color: '#888',
                background: '#1a1a1a', border: '1px solid #252525',
                borderRadius: 3, padding: '1px 6px', marginRight: 4,
                fontFamily: "'JetBrains Mono', monospace"
              }}>
                {a}
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
          <span style={{ color: primaryColor, fontWeight: 600, fontSize: 16 }}>
            £{Number(item.price).toFixed(2)}
          </span>
          {qty === 0 ? (
            <button
              onClick={onAdd}
              style={{
                background: primaryColor,
                color: '#0a0a0a',
                border: 'none',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontFamily: "'Outfit', sans-serif"
              }}
            >
              <Plus size={14} /> Add
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={onRemove} style={{ background: '#1a1a1a', border: '1px solid #333', color: '#fff', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Minus size={12} />
              </button>
              <span style={{ color: primaryColor, fontWeight: 600, fontSize: 15, minWidth: 18, textAlign: 'center' }}>{qty}</span>
              <button onClick={onAdd} style={{ background: primaryColor, border: 'none', color: '#0a0a0a', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Plus size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LoadingPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2px solid #222', borderTop: '2px solid #C9A84C', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function ErrorPage({ message }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <WifiOff size={48} color="#333" style={{ marginBottom: 20 }} />
        <div style={{ color: '#fff', fontSize: 18, marginBottom: 8, fontFamily: "'Cormorant Garamond', serif" }}>Not available</div>
        <div style={{ color: '#666', fontSize: 14, lineHeight: 1.6 }}>{message}</div>
      </div>
    </div>
  )
}
