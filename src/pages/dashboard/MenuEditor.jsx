// src/pages/dashboard/MenuEditor.jsx
import { useEffect, useState } from 'react'
import { useRestaurant } from '../../contexts/RestaurantContext'
import { sbGet, sbInsert, sbUpdate, sbDelete } from '../../lib/supabase'
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'

export default function MenuEditor() {
  const { restaurant } = useRestaurant()
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [expandedCats, setExpandedCats] = useState({})

  useEffect(() => {
    if (!restaurant) return
    load()
  }, [restaurant])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [cats, menuItems] = await Promise.all([
        sbGet('menu_categories', { eq: { restaurant_id: restaurant.id }, order: 'sort_order.asc' }),
        sbGet('menu_items', { eq: { restaurant_id: restaurant.id }, order: 'sort_order.asc' })
      ])
      setCategories(cats)
      setItems(menuItems)
      const expanded = {}
      cats.forEach(c => { expanded[c.id] = true })
      setExpandedCats(expanded)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function addCategory() {
    if (!newCatName.trim()) return
    try {
      const cat = await sbInsert('menu_categories', {
        restaurant_id: restaurant.id,
        name: newCatName.trim(),
        sort_order: categories.length
      })
      setCategories(prev => [...prev, cat])
      setExpandedCats(prev => ({ ...prev, [cat.id]: true }))
      setNewCatName('')
      setAddingCategory(false)
    } catch (err) { setError(err.message) }
  }

  async function toggleItemAvailability(item) {
    try {
      await sbUpdate('menu_items', { id: item.id }, { is_available: !item.is_available })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: !i.is_available } : i))
    } catch (err) { setError(err.message) }
  }

  async function deleteItem(id) {
    if (!confirm('Delete this item?')) return
    try {
      await sbDelete('menu_items', { id })
      setItems(prev => prev.filter(i => i.id !== id))
    } catch (err) { setError(err.message) }
  }

  const primary = restaurant?.primary_color || '#C9A84C'
  const inputStyle = {
    width: '100%', background: '#0a0a0a', border: '1px solid #2a2a2a',
    borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 14,
    boxSizing: 'border-box', fontFamily: "'Outfit', sans-serif", outline: 'none'
  }
  const labelStyle = { display: 'block', color: '#666', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }

  if (loading) return <Loader />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 500, margin: 0, fontFamily: "'Cormorant Garamond', serif" }}>Menu</h1>
        <button onClick={() => setAddingCategory(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1a1a1a', color: '#aaa', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}>
          <Plus size={14} /> Add category
        </button>
      </div>

      {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 14, display: 'flex', gap: 8 }}><AlertCircle size={14} /> {error}</div>}

      {addingCategory && (
        <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 10, padding: '16px', marginBottom: 16, display: 'flex', gap: 8 }}>
          <input style={{ ...inputStyle, flex: 1 }} placeholder="Category name (e.g. Starters)" value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addCategory(); if (e.key === 'Escape') setAddingCategory(false) }}
            autoFocus />
          <button onClick={addCategory} style={{ background: primary, color: '#0a0a0a', border: 'none', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontWeight: 500 }}>Add</button>
          <button onClick={() => setAddingCategory(false)} style={{ background: 'none', border: '1px solid #222', color: '#666', borderRadius: 8, padding: '10px 14px', cursor: 'pointer' }}>Cancel</button>
        </div>
      )}

      {categories.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#555', border: '1px dashed #1e1e1e', borderRadius: 12 }}>
          No categories yet. Add one to start building your menu.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {categories.map(cat => {
            const catItems = items.filter(i => i.category_id === cat.id)
            const expanded = expandedCats[cat.id]
            return (
              <div key={cat.id} style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{
                  padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
                  cursor: 'pointer', borderBottom: expanded ? '1px solid #1a1a1a' : 'none'
                }}
                  onClick={() => setExpandedCats(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))}>
                  {expanded ? <ChevronDown size={16} color="#555" /> : <ChevronRight size={16} color="#555" />}
                  <span style={{ color: '#fff', fontWeight: 500, flex: 1, fontSize: 15 }}>{cat.name}</span>
                  <span style={{ color: '#444', fontSize: 12 }}>{catItems.length} item{catItems.length !== 1 ? 's' : ''}</span>
                </div>

                {expanded && (
                  <div style={{ padding: '12px 16px' }}>
                    {catItems.map(item => (
                      <div key={item.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                        borderBottom: '1px solid #1a1a1a'
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: item.is_available ? '#fff' : '#444', fontWeight: 500, fontSize: 14 }}>{item.name}</span>
                            {!item.is_available && (
                              <span style={{ fontSize: 10, color: '#555', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 4, padding: '1px 6px', fontFamily: "'JetBrains Mono', monospace" }}>UNAVAILABLE</span>
                            )}
                          </div>
                          {item.description && <div style={{ color: '#555', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>}
                        </div>
                        <span style={{ color: primary, fontWeight: 600, fontSize: 14, flexShrink: 0 }}>£{Number(item.price).toFixed(2)}</span>
                        <button onClick={() => toggleItemAvailability(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: item.is_available ? '#22c55e' : '#555', padding: 4 }} title={item.is_available ? 'Mark unavailable' : 'Mark available'}>
                          <div style={{ width: 28, height: 16, borderRadius: 8, background: item.is_available ? '#22c55e' : '#222', position: 'relative', transition: 'background 0.2s' }}>
                            <div style={{ position: 'absolute', top: 2, left: item.is_available ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                          </div>
                        </button>
                        <button onClick={() => setEditingItem(item)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: 4 }}><Pencil size={14} /></button>
                        <button onClick={() => deleteItem(item.id)} style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', padding: 4 }}><Trash2 size={14} /></button>
                      </div>
                    ))}
                    <button
                      onClick={() => setEditingItem({ category_id: cat.id, restaurant_id: restaurant.id, name: '', description: '', price: '', allergens: [], is_available: true, sort_order: catItems.length })}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px dashed #222', color: '#555', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, marginTop: 10, fontFamily: "'Outfit', sans-serif", width: '100%', justifyContent: 'center' }}
                    >
                      <Plus size={13} /> Add item to {cat.name}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Item edit modal */}
      {editingItem && (
        <ItemModal
          item={editingItem}
          primaryColor={primary}
          onClose={() => setEditingItem(null)}
          onSaved={(saved) => {
            if (editingItem.id) {
              setItems(prev => prev.map(i => i.id === saved.id ? saved : i))
            } else {
              setItems(prev => [...prev, saved])
            }
            setEditingItem(null)
          }}
        />
      )}
    </div>
  )
}

function ItemModal({ item, primaryColor, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: item.name || '',
    description: item.description || '',
    price: item.price || '',
    allergens: item.allergens || [],
    is_available: item.is_available !== false,
    category_id: item.category_id,
    restaurant_id: item.restaurant_id,
    sort_order: item.sort_order || 0
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isNew = !item.id

  const allergenOptions = ['Gluten', 'Dairy', 'Eggs', 'Peanuts', 'Tree nuts', 'Fish', 'Shellfish', 'Soy', 'Sesame', 'Mustard']

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.price) { setError('Name and price are required'); return }
    setSaving(true)
    setError('')
    try {
      const data = { ...form, price: parseFloat(form.price) }
      let saved
      if (isNew) {
        saved = await sbInsert('menu_items', data)
      } else {
        saved = await sbUpdate('menu_items', { id: item.id }, data)
      }
      onSaved(saved)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const inputStyle = { width: '100%', background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 14, boxSizing: 'border-box', fontFamily: "'Outfit', sans-serif", outline: 'none' }
  const labelStyle = { display: 'block', color: '#666', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #1e1e1e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ color: '#fff', margin: 0, fontSize: 16 }}>{isNew ? 'Add item' : 'Edit item'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <form onSubmit={handleSave} style={{ padding: '20px 24px' }}>
          {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input style={inputStyle} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required autoFocus />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Price (£) *</label>
              <input style={inputStyle} type="number" step="0.01" min="0" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} required />
            </div>
            <div>
              <label style={labelStyle}>Allergens</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allergenOptions.map(a => (
                  <button key={a} type="button"
                    onClick={() => setForm(p => ({ ...p, allergens: p.allergens.includes(a) ? p.allergens.filter(x => x !== a) : [...p.allergens, a] }))}
                    style={{ background: form.allergens.includes(a) ? primaryColor : '#1a1a1a', color: form.allergens.includes(a) ? '#0a0a0a' : '#666', border: `1px solid ${form.allergens.includes(a) ? primaryColor : '#2a2a2a'}`, borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid #2a2a2a', color: '#777', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ background: primaryColor, color: '#0a0a0a', border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Outfit', sans-serif" }}>
              {saving ? 'Saving...' : isNew ? 'Add item' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Loader() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><div style={{ width: 28, height: 28, border: '2px solid #222', borderTop: '2px solid #C9A84C', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>
}
