// src/pages/order/Checkout.jsx
import { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { sbGet, sbGetOne, sbInsert, sbRpc } from '../../lib/supabase'
import { ChevronLeft, Clock, User, Phone, Mail, FileText, AlertCircle } from 'lucide-react'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

export default function Checkout() {
  const { slug } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()

  const basket = state?.basket || []
  const restaurant = state?.restaurant

  const [slots, setSlots] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [slotCapacities, setSlotCapacities] = useState({})
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', notes: '' })
  const [clientSecret, setClientSecret] = useState(null)
  const [step, setStep] = useState(1) // 1=slot, 2=details, 3=payment
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const subtotal = basket.reduce((s, b) => s + b.price * b.quantity, 0)
  const total = subtotal
  const primary = restaurant?.primary_color || '#C9A84C'

  useEffect(() => {
    if (!restaurant) { navigate(`/order/${slug}`); return }
    loadSlots()
    // Default to today
    const today = new Date().toISOString().split('T')[0]
    setSelectedDate(today)
  }, [restaurant])

  useEffect(() => {
    if (selectedDate && slots.length > 0) {
      checkCapacities()
    }
  }, [selectedDate, slots])

  async function loadSlots() {
    setLoading(true)
    try {
      const rows = await sbGet('collection_slots', {
        eq: { restaurant_id: restaurant.id },
        filter: { is_active: 'eq.true' },
        order: 'slot_time.asc'
      })
      setSlots(rows)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function checkCapacities() {
    const caps = {}
    await Promise.all(slots.map(async slot => {
      try {
        const count = await sbRpc('check_slot_capacity', {
          p_restaurant_id: restaurant.id,
          p_collection_date: selectedDate,
          p_collection_time: slot.slot_time
        })
        caps[slot.slot_time] = { current: count, max: slot.max_orders }
      } catch { caps[slot.slot_time] = { current: 0, max: slot.max_orders } }
    }))
    setSlotCapacities(caps)
  }

  async function createPaymentIntent() {
    setError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_WORKER_URL}/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(total * 100),
          currency: 'gbp',
          restaurant_id: restaurant.id,
          stripe_account_id: restaurant.stripe_account_id,
          commission_rate: restaurant.commission_rate
        })
      })
      if (!res.ok) throw new Error('Failed to create payment session')
      const { clientSecret: cs } = await res.json()
      setClientSecret(cs)
      setStep(3)
    } catch (err) {
      setError(err.message)
    }
  }

  function handleProceedToDetails() {
    if (!selectedSlot) { setError('Please select a collection time'); return }
    setError(null)
    setStep(2)
  }

  function handleProceedToPayment(e) {
    e.preventDefault()
    if (!customer.name.trim()) { setError('Please enter your name'); return }
    setError(null)
    createPaymentIntent()
  }

  // Get next 7 days
  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return {
      value: d.toISOString().split('T')[0],
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    }
  })

  if (!restaurant) return null

  const inputStyle = {
    width: '100%', background: '#0a0a0a', border: '1px solid #2a2a2a',
    borderRadius: 8, padding: '11px 14px', color: '#fff', fontSize: 14,
    boxSizing: 'border-box', fontFamily: "'Outfit', sans-serif", outline: 'none'
  }
  const labelStyle = { display: 'block', color: '#666', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', fontFamily: "'Outfit', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Outfit:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: '#111', borderBottom: '1px solid #1e1e1e', padding: '16px 24px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => step > 1 ? setStep(step - 1) : navigate(`/order/${slug}`)}
            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, padding: 0 }}>
            <ChevronLeft size={16} /> Back
          </button>
          <span style={{ color: '#333' }}>|</span>
          <span style={{ color: '#fff', fontSize: 15, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>{restaurant.name}</span>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
          {['Collection time', 'Your details', 'Payment'].map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: 3, background: step > i ? primary : '#1e1e1e', borderRadius: 2, marginBottom: 6, transition: 'background 0.3s' }} />
              <span style={{ fontSize: 11, color: step === i + 1 ? primary : '#555', fontFamily: "'JetBrains Mono', monospace" }}>
                {s.toUpperCase()}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* Order summary always visible */}
        <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, padding: '16px', marginBottom: 24 }}>
          <div style={{ color: '#888', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginBottom: 12 }}>ORDER SUMMARY</div>
          {basket.map((b, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 14 }}>
              <span style={{ color: '#aaa' }}>×{b.quantity} {b.item.name}</span>
              <span style={{ color: '#888' }}>£{(b.price * b.quantity).toFixed(2)}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid #1e1e1e', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
            <span style={{ color: '#fff' }}>Total</span>
            <span style={{ color: primary, fontSize: 18 }}>£{total.toFixed(2)}</span>
          </div>
        </div>

        {/* Step 1: Slot picker */}
        {step === 1 && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 500, margin: '0 0 20px', fontFamily: "'Cormorant Garamond', serif" }}>
              Choose collection time
            </h2>

            {/* Date selector */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Date</label>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {dateOptions.map(d => (
                  <button key={d.value} onClick={() => setSelectedDate(d.value)} style={{
                    background: selectedDate === d.value ? primary : '#141414',
                    color: selectedDate === d.value ? '#0a0a0a' : '#888',
                    border: `1px solid ${selectedDate === d.value ? primary : '#222'}`,
                    borderRadius: 8, padding: '8px 16px', fontSize: 13,
                    cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Outfit', sans-serif"
                  }}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Slot grid */}
            <div style={{ marginBottom: 28 }}>
              <label style={labelStyle}>Time</label>
              {loading ? (
                <div style={{ color: '#555', fontSize: 14 }}>Loading slots...</div>
              ) : slots.length === 0 ? (
                <div style={{ color: '#555', fontSize: 14 }}>No collection slots available.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
                  {slots.map(slot => {
                    const cap = slotCapacities[slot.slot_time]
                    const full = cap && cap.current >= cap.max
                    const selected = selectedSlot === slot.slot_time
                    return (
                      <button
                        key={slot.id}
                        onClick={() => !full && setSelectedSlot(slot.slot_time)}
                        disabled={full}
                        style={{
                          background: selected ? primary : full ? '#111' : '#141414',
                          color: selected ? '#0a0a0a' : full ? '#333' : '#ccc',
                          border: `1px solid ${selected ? primary : full ? '#1a1a1a' : '#222'}`,
                          borderRadius: 8, padding: '10px 8px',
                          fontSize: 14, fontWeight: selected ? 600 : 400,
                          cursor: full ? 'not-allowed' : 'pointer',
                          fontFamily: "'JetBrains Mono', monospace",
                          textDecoration: full ? 'line-through' : 'none',
                          transition: 'all 0.15s'
                        }}
                      >
                        {slot.slot_time}
                        {full && <div style={{ fontSize: 9, marginTop: 2 }}>FULL</div>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <button onClick={handleProceedToDetails} style={{
              width: '100%', background: primary, color: '#0a0a0a', border: 'none',
              borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Outfit', sans-serif"
            }}>
              Continue
            </button>
          </div>
        )}

        {/* Step 2: Customer details */}
        {step === 2 && (
          <form onSubmit={handleProceedToPayment}>
            <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 500, margin: '0 0 20px', fontFamily: "'Cormorant Garamond', serif" }}>
              Your details
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
              <Clock size={14} color={primary} />
              <span style={{ color: '#aaa', fontSize: 13 }}>
                Collecting <strong style={{ color: '#fff' }}>{selectedDate === new Date().toISOString().split('T')[0] ? 'today' : selectedDate}</strong> at <strong style={{ color: '#fff' }}>{selectedSlot}</strong>
              </span>
            </div>

            <div style={{ display: 'grid', gap: 14, marginBottom: 24 }}>
              <div>
                <label style={labelStyle}><User size={10} style={{ display: 'inline' }} /> Name *</label>
                <input style={inputStyle} value={customer.name} onChange={e => setCustomer(p => ({ ...p, name: e.target.value }))} required placeholder="Your full name"
                  onFocus={e => e.target.style.borderColor = primary} onBlur={e => e.target.style.borderColor = '#2a2a2a'} />
              </div>
              <div>
                <label style={labelStyle}><Mail size={10} style={{ display: 'inline' }} /> Email (for confirmation)</label>
                <input style={inputStyle} type="email" value={customer.email} onChange={e => setCustomer(p => ({ ...p, email: e.target.value }))} placeholder="your@email.com"
                  onFocus={e => e.target.style.borderColor = primary} onBlur={e => e.target.style.borderColor = '#2a2a2a'} />
              </div>
              <div>
                <label style={labelStyle}><Phone size={10} style={{ display: 'inline' }} /> Phone</label>
                <input style={inputStyle} type="tel" value={customer.phone} onChange={e => setCustomer(p => ({ ...p, phone: e.target.value }))} placeholder="07700 000000"
                  onFocus={e => e.target.style.borderColor = primary} onBlur={e => e.target.style.borderColor = '#2a2a2a'} />
              </div>
              <div>
                <label style={labelStyle}><FileText size={10} style={{ display: 'inline' }} /> Order notes</label>
                <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} value={customer.notes} onChange={e => setCustomer(p => ({ ...p, notes: e.target.value }))} placeholder="Allergies, special requests..."
                  onFocus={e => e.target.style.borderColor = primary} onBlur={e => e.target.style.borderColor = '#2a2a2a'} />
              </div>
            </div>

            <button type="submit" style={{
              width: '100%', background: primary, color: '#0a0a0a', border: 'none',
              borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Outfit', sans-serif"
            }}>
              Proceed to payment
            </button>
          </form>
        )}

        {/* Step 3: Stripe payment */}
        {step === 3 && clientSecret && (
          <div>
            <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 500, margin: '0 0 20px', fontFamily: "'Cormorant Garamond', serif" }}>
              Payment
            </h2>
            <Elements stripe={stripePromise} options={{
              clientSecret,
              appearance: {
                theme: 'night',
                variables: {
                  colorPrimary: primary,
                  colorBackground: '#141414',
                  colorText: '#ffffff',
                  colorDanger: '#ef4444',
                  fontFamily: "'Outfit', sans-serif",
                  borderRadius: '8px'
                }
              }
            }}>
              <PaymentForm
                basket={basket}
                customer={customer}
                restaurant={restaurant}
                selectedDate={selectedDate}
                selectedSlot={selectedSlot}
                subtotal={subtotal}
                total={total}
                primaryColor={primary}
                slug={slug}
              />
            </Elements>
          </div>
        )}
      </div>
    </div>
  )
}

function PaymentForm({ basket, customer, restaurant, selectedDate, selectedSlot, subtotal, total, primaryColor, slug }) {
  const stripe = useStripe()
  const elements = useElements()
  const navigate = useNavigate()
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState(null)

  async function handlePay(e) {
    e.preventDefault()
    if (!stripe || !elements) return
    setPaying(true)
    setError(null)

    try {
      // Confirm Stripe payment
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required'
      })
      if (stripeError) throw new Error(stripeError.message)
      if (paymentIntent.status !== 'succeeded') throw new Error('Payment not completed')

      // Generate order number via RPC
      const orderNumber = await sbRpc('generate_order_number', { p_restaurant_id: restaurant.id })

      // Insert order
      const commissionAmount = total * (restaurant.commission_rate / 100)
      const order = await sbInsert('orders', {
        restaurant_id: restaurant.id,
        order_number: orderNumber,
        customer_name: customer.name,
        customer_email: customer.email || null,
        customer_phone: customer.phone || null,
        items: JSON.stringify(basket.map(b => ({
          name: b.item.name,
          quantity: b.quantity,
          price: b.price,
          options: b.selectedOptions
        }))),
        subtotal,
        commission_amount: commissionAmount,
        total,
        collection_time: selectedSlot,
        collection_date: selectedDate,
        status: 'pending',
        payment_method: 'online',
        payment_status: 'paid',
        stripe_payment_intent_id: paymentIntent.id,
        notes: customer.notes || null
      })

      // Send confirmation notifications via Worker
      if (import.meta.env.VITE_WORKER_URL) {
        fetch(`${import.meta.env.VITE_WORKER_URL}/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'order_confirmation',
            order,
            restaurant,
            customer
          })
        }).catch(() => {}) // Non-blocking
      }

      navigate(`/order/${slug}/confirmation`, { state: { order, restaurant } })
    } catch (err) {
      setError(err.message)
      setPaying(false)
    }
  }

  return (
    <form onSubmit={handlePay}>
      <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, padding: '20px', marginBottom: 20 }}>
        <PaymentElement />
      </div>
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
      <button type="submit" disabled={paying || !stripe} style={{
        width: '100%', background: paying ? '#333' : primaryColor,
        color: paying ? '#666' : '#0a0a0a', border: 'none', borderRadius: 10,
        padding: '14px', fontSize: 15, fontWeight: 600, cursor: paying ? 'not-allowed' : 'pointer',
        fontFamily: "'Outfit', sans-serif"
      }}>
        {paying ? 'Processing...' : `Pay £${total.toFixed(2)}`}
      </button>
      <p style={{ color: '#444', fontSize: 12, textAlign: 'center', marginTop: 12 }}>
        Payments secured by Stripe. Your card details are never stored.
      </p>
    </form>
  )
}
