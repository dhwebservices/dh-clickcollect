// src/pages/dashboard/Hours.jsx
import { useEffect, useState } from 'react'
import { useRestaurant } from '../../contexts/RestaurantContext'
import { sbGet, sbInsert, sbUpdate, sbDelete } from '../../lib/supabase'
import { Plus, Trash2, AlertCircle } from 'lucide-react'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function Hours() {
  const { restaurant } = useRestaurant()
  const [hours, setHours] = useState([])
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [error, setError] = useState(null)
  const [newSlot, setNewSlot] = useState('')
  const [newSlotMax, setNewSlotMax] = useState(5)

  useEffect(() => {
    if (!restaurant) return
    load()
  }, [restaurant])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [h, s] = await Promise.all([
        sbGet('opening_hours', { eq: { restaurant_id: restaurant.id }, order: 'day.asc' }),
        sbGet('collection_slots', { eq: { restaurant_id: restaurant.id }, order: 'slot_time.asc' })
      ])
      // Fill missing days
      const filled = DAYS.map((_, i) => h.find(r => r.day === i) || { day: i, open_time: '09:00', close_time: '21:00', is_closed: false, restaurant_id: restaurant.id })
      setHours(filled)
      setSlots(s)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function saveHours(day, field, value) {
    setSaving(prev => ({ ...prev, [day]: true }))
    try {
      const existing = hours.find(h => h.day === day)
      if (existing?.id) {
        await sbUpdate('opening_hours', { id: existing.id }, { [field]: value })
      } else {
        const saved = await sbInsert('opening_hours', { ...existing, [field]: value })
        setHours(prev => prev.map(h => h.day === day ? saved : h))
        return
      }
      setHours(prev => prev.map(h => h.day === day ? { ...h, [field]: value } : h))
    } catch (err) { setError(err.message) }
    finally { setSaving(prev => ({ ...prev, [day]: false })) }
  }

  async function addSlot() {
    if (!newSlot) return
    // Validate time format
    if (!/^\d{2}:\d{2}$/.test(newSlot)) { setError('Enter time as HH:MM (e.g. 12:30)'); return }
    try {
      const slot = await sbInsert('collection_slots', {
        restaurant_id: restaurant.id,
        slot_time: newSlot,
        max_orders: newSlotMax,
        is_active: true
      })
      setSlots(prev => [...prev, slot].sort((a, b) => a.slot_time.localeCompare(b.slot_time)))
      setNewSlot('')
    } catch (err) { setError(err.message) }
  }

  async function deleteSlot(id) {
    try {
      await sbDelete('collection_slots', { id })
      setSlots(prev => prev.filter(s => s.id !== id))
    } catch (err) { setError(err.message) }
  }

  async function toggleSlot(slot) {
    try {
      await sbUpdate('collection_slots', { id: slot.id }, { is_active: !slot.is_active })
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, is_active: !s.is_active } : s))
    } catch (err) { setError(err.message) }
  }

  async function updateSlotMax(slot, max) {
    try {
      await sbUpdate('collection_slots', { id: slot.id }, { max_orders: parseInt(max) })
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, max_orders: parseInt(max) } : s))
    } catch (err) { setError(err.message) }
  }

  const inputStyle = { background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 10px', color: '#fff', fontSize: 14, fontFamily: "'Outfit', sans-serif", outline: 'none' }
  const labelStyle = { color: '#666', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.08em' }

  if (loading) return <Loader />

  return (
    <div>
      <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 500, margin: '0 0 28px', fontFamily: "'Cormorant Garamond', serif" }}>Hours & Collection Slots</h1>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 14, display: 'flex', gap: 8 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Opening hours */}
      <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden', marginBottom: 28 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e1e1e' }}>
          <span style={labelStyle}>Opening hours</span>
        </div>
        {hours.map(h => (
          <div key={h.day} style={{
            padding: '14px 20px',
            borderBottom: '1px solid #111',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            opacity: h.is_closed ? 0.5 : 1
          }}>
            <span style={{ color: '#ccc', width: 90, fontSize: 14 }}>{DAYS[h.day]}</span>
            <div style={{
              width: 36, height: 20, borderRadius: 10,
              background: h.is_closed ? '#222' : '#22c55e',
              position: 'relative', cursor: 'pointer', flexShrink: 0,
              transition: 'background 0.2s'
            }}
              onClick={() => saveHours(h.day, 'is_closed', !h.is_closed)}>
              <div style={{
                position: 'absolute', top: 2, left: h.is_closed ? 2 : 18, width: 16, height: 16,
                borderRadius: '50%', background: '#fff', transition: 'left 0.2s'
              }} />
            </div>
            {h.is_closed ? (
              <span style={{ color: '#444', fontSize: 13 }}>Closed</span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="time" value={h.open_time || '09:00'}
                  onChange={e => saveHours(h.day, 'open_time', e.target.value)}
                  style={{ ...inputStyle, width: 110 }} />
                <span style={{ color: '#555', fontSize: 13 }}>to</span>
                <input type="time" value={h.close_time || '21:00'}
                  onChange={e => saveHours(h.day, 'close_time', e.target.value)}
                  style={{ ...inputStyle, width: 110 }} />
                {saving[h.day] && <span style={{ color: '#555', fontSize: 12 }}>Saving...</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Collection slots */}
      <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e1e1e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={labelStyle}>Collection time slots</span>
          <span style={{ color: '#555', fontSize: 12 }}>Set how many orders per slot</span>
        </div>

        {slots.map(slot => (
          <div key={slot.id} style={{
            padding: '12px 20px', borderBottom: '1px solid #111',
            display: 'flex', alignItems: 'center', gap: 14
          }}>
            <div style={{
              width: 32, height: 18, borderRadius: 9,
              background: slot.is_active ? '#22c55e' : '#222',
              position: 'relative', cursor: 'pointer', flexShrink: 0,
              transition: 'background 0.2s'
            }}
              onClick={() => toggleSlot(slot)}>
              <div style={{
                position: 'absolute', top: 1, left: slot.is_active ? 15 : 1, width: 16, height: 16,
                borderRadius: '50%', background: '#fff', transition: 'left 0.2s'
              }} />
            </div>
            <span style={{ color: slot.is_active ? '#fff' : '#444', fontFamily: "'JetBrains Mono', monospace", fontSize: 14, width: 60 }}>{slot.slot_time}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#555', fontSize: 12 }}>Max orders:</span>
              <input type="number" min="1" max="50" value={slot.max_orders}
                onChange={e => updateSlotMax(slot, e.target.value)}
                style={{ ...inputStyle, width: 60, textAlign: 'center' }} />
            </div>
            <button onClick={() => deleteSlot(slot.id)} style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer', marginLeft: 'auto', padding: 4 }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <div style={{ padding: '14px 20px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="time" value={newSlot} onChange={e => setNewSlot(e.target.value)} style={{ ...inputStyle, width: 120 }} placeholder="HH:MM" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#555', fontSize: 12 }}>Max:</span>
            <input type="number" min="1" max="50" value={newSlotMax} onChange={e => setNewSlotMax(e.target.value)} style={{ ...inputStyle, width: 60, textAlign: 'center' }} />
          </div>
          <button onClick={addSlot} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1a1a1a', color: '#aaa', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontFamily: "'Outfit', sans-serif" }}>
            <Plus size={14} /> Add slot
          </button>
        </div>
      </div>
    </div>
  )
}

function Loader() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><div style={{ width: 28, height: 28, border: '2px solid #222', borderTop: '2px solid #C9A84C', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>
}
