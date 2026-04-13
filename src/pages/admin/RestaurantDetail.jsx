import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  ChefHat,
  Copy,
  CreditCard,
  Eye,
  KeyRound,
  LockKeyhole,
  Save,
  Sparkles,
  Store,
  UsersRound,
} from 'lucide-react'
import { sbGet, sbGetOne, sbUpdate } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const ROLE_LABELS = {
  manager: 'Manager',
  staff: 'Staff',
  kitchen: 'Kitchen',
}

const ROLE_DESCRIPTIONS = {
  manager: 'Dashboard, orders, menu, hours, reporting, and restaurant settings.',
  staff: 'General restaurant portal with orders and day-to-day operations.',
  kitchen: 'Kitchen screen only for preparing and marking orders ready.',
}

const STATUS_META = {
  active: { label: 'Live', tone: 'success' },
  pending: { label: 'Pending setup', tone: 'warning' },
  suspended: { label: 'Suspended', tone: 'danger' },
}

export default function RestaurantDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { startImpersonation, adminProfile } = useAuth()
  const [restaurant, setRestaurant] = useState(null)
  const [orders, setOrders] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [accountBusy, setAccountBusy] = useState(false)
  const [error, setError] = useState('')
  const [accountError, setAccountError] = useState('')
  const [accountMessage, setAccountMessage] = useState('')
  const [form, setForm] = useState(null)
  const [accountForm, setAccountForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'manager',
  })
  const [passwordForm, setPasswordForm] = useState({})

  useEffect(() => {
    load()
  }, [id])

  async function load() {
    setLoading(true)
    setError('')
    setAccountError('')
    try {
      const [record, recentOrders] = await Promise.all([
        sbGetOne('restaurants', { eq: { id } }),
        sbGet('orders', {
          eq: { restaurant_id: id },
          order: 'created_at.desc',
          limit: 20,
        }),
      ])
      setRestaurant(record)
      setForm(record)
      setOrders(recentOrders)
      await loadAccounts()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function adminWorkerFetch(path, init = {}) {
    const workerUrl = import.meta.env.VITE_WORKER_URL
    if (!workerUrl) throw new Error('VITE_WORKER_URL is not configured')
    if (!adminProfile?.token) throw new Error('Admin session missing. Sign in again.')

    const res = await fetch(`${workerUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminProfile.token}`,
        ...(init.headers || {}),
      },
    })

    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error || payload.message || `Request failed (${res.status})`)
    return payload.data
  }

  async function loadAccounts() {
    try {
      const rows = await adminWorkerFetch(`/admin/restaurant-users?restaurant_id=${id}`, { method: 'GET' })
      setAccounts(Array.isArray(rows) ? rows : [])
    } catch (err) {
      setAccountError(err.message || 'Could not load restaurant logins')
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const updated = await sbUpdate('restaurants', { id }, form)
      setRestaurant(updated)
      setForm(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateAccount(event) {
    event.preventDefault()
    setAccountBusy(true)
    setAccountError('')
    setAccountMessage('')
    try {
      await adminWorkerFetch('/admin/restaurant-users', {
        method: 'POST',
        body: JSON.stringify({
          restaurantId: id,
          fullName: accountForm.fullName.trim(),
          email: accountForm.email.trim().toLowerCase(),
          password: accountForm.password,
          role: accountForm.role,
        }),
      })
      setAccountMessage(`Login created for ${accountForm.email.trim().toLowerCase()}. Share the credentials securely.`)
      setAccountForm({ fullName: '', email: '', password: '', role: 'manager' })
      await loadAccounts()
    } catch (err) {
      setAccountError(err.message)
    } finally {
      setAccountBusy(false)
    }
  }

  async function handleResetPassword(account) {
    const nextPassword = passwordForm[account.user_id] || ''
    setAccountBusy(true)
    setAccountError('')
    setAccountMessage('')
    try {
      await adminWorkerFetch('/admin/restaurant-users/password', {
        method: 'POST',
        body: JSON.stringify({
          userId: account.user_id,
          password: nextPassword,
        }),
      })
      setPasswordForm((current) => ({ ...current, [account.user_id]: '' }))
      setAccountMessage(`Password reset for ${account.email}.`)
    } catch (err) {
      setAccountError(err.message)
    } finally {
      setAccountBusy(false)
    }
  }

  function createGeneratedPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$'
    return Array.from({ length: 14 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  }

  async function fillGeneratedPassword() {
    const nextPassword = createGeneratedPassword()
    setAccountForm((current) => ({ ...current, password: nextPassword }))
    try {
      await navigator.clipboard.writeText(nextPassword)
      setAccountMessage('Strong temporary password generated and copied.')
    } catch {
      setAccountMessage('Strong temporary password generated.')
    }
  }

  async function copyCredentials(email, password) {
    const lines = [`Username: ${email}`, `Password: ${password}`]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setAccountMessage(`Credentials copied for ${email}.`)
    } catch {
      setAccountMessage(`Credentials prepared for ${email}. Copy them manually.`)
    }
  }

  if (loading) return <Loader />
  if (!restaurant || !form) return <div style={{ color: 'var(--admin-danger)' }}>Restaurant not found.</div>

  const paidOrders = orders.filter((order) => order.payment_status === 'paid')
  const paidRevenue = paidOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0)
  const todayOrders = orders.filter((order) => isToday(order.created_at))
  const todayRevenue = todayOrders
    .filter((order) => order.payment_status === 'paid')
    .reduce((sum, order) => sum + (Number(order.total) || 0), 0)
  const nextCollection = orders.find((order) => ['pending', 'accepted', 'ready'].includes(order.status))
  const statusMeta = STATUS_META[restaurant.status] || { label: restaurant.status || 'Unknown', tone: 'warning' }
  const checklist = [
    { label: 'Restaurant identity', done: Boolean(form.name && form.slug && form.email) },
    { label: 'Commercial setup', done: Boolean(form.plan && Number(form.commission_rate) >= 0) },
    { label: 'Stripe connection', done: Boolean(form.stripe_account_id) },
    { label: 'Staff login created', done: accounts.length > 0 },
    { label: 'Ready to go live', done: restaurant.status === 'active' && accounts.length > 0 },
  ]
  const setupScore = Math.round((checklist.filter((item) => item.done).length / checklist.length) * 100)

  const cards = useMemo(() => ([
    { label: 'Status', value: statusMeta.label, hint: form.plan || 'No plan set', tone: statusMeta.tone },
    { label: 'Today', value: `${todayOrders.length} orders`, hint: `£${todayRevenue.toFixed(2)} paid today`, tone: 'neutral' },
    { label: 'Staff access', value: `${accounts.length}`, hint: accounts.length ? 'Login accounts linked' : 'No logins yet', tone: accounts.length ? 'success' : 'warning' },
    { label: 'Next action', value: nextCollection ? `#${nextCollection.order_number}` : 'No live orders', hint: nextCollection ? `${nextCollection.status} · ${nextCollection.collection_time}` : 'No collection queue', tone: nextCollection ? 'neutral' : 'warning' },
  ]), [accounts.length, form.plan, nextCollection, statusMeta.label, statusMeta.tone, todayOrders.length, todayRevenue])

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div style={heroCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
            <Link to="/admin/restaurants" style={backLink}>
              <ArrowLeft size={14} />
              Back to restaurants
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={brandMark}>
                <Store size={18} />
              </div>
              <div>
                <h1 style={pageTitle}>{restaurant.name}</h1>
                <div style={subtleRow}>
                  <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
                  <span>/{restaurant.slug}</span>
                  <span>{restaurant.email || 'No email set'}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <button
              type="button"
              onClick={() => {
                startImpersonation(restaurant)
                navigate('/dashboard')
              }}
              style={secondaryButton}
            >
              <Eye size={14} />
              Open dashboard
            </button>
            <button
              type="button"
              onClick={() => {
                startImpersonation(restaurant)
                navigate('/kitchen')
              }}
              style={secondaryButton}
            >
              <ChefHat size={14} />
              Open kitchen
            </button>
          </div>
        </div>

        <div style={statsGrid}>
          {cards.map((card) => (
            <div key={card.label} style={metricCard}>
              <div style={metricLabel}>{card.label}</div>
              <div style={metricValue}>{card.value}</div>
              <div style={{ ...metricHint, color: toneColor(card.tone) }}>{card.hint}</div>
            </div>
          ))}
        </div>
      </div>

      {error ? <Banner tone="danger" message={error} /> : null}

      <div style={contentGrid}>
        <div style={{ display: 'grid', gap: 20 }}>
          <section style={panel}>
            <div style={sectionHeader}>
              <div>
                <div style={sectionKicker}>Overview</div>
                <h2 style={sectionTitle}>Restaurant setup</h2>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={metricLabel}>Completion</div>
                <div style={{ ...metricValue, fontSize: 24 }}>{setupScore}%</div>
              </div>
            </div>

            <div style={checklistWrap}>
              {checklist.map((item) => (
                <div key={item.label} style={checklistItem}>
                  <span style={{ color: item.done ? 'var(--admin-success)' : 'var(--admin-text-muted)' }}>
                    <CheckCircle2 size={16} />
                  </span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            <form onSubmit={handleSave} style={{ display: 'grid', gap: 24 }}>
              <div style={formSectionGrid}>
                <SectionBlock
                  icon={<Store size={15} />}
                  title="Identity"
                  description="Core restaurant details used across the public ordering flow."
                >
                  <Field label="Restaurant name">
                    <input value={form.name || ''} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Slug">
                    <input value={form.slug || ''} onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Email">
                    <input value={form.email || ''} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Phone">
                    <input value={form.phone || ''} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Address">
                    <input value={form.address || ''} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} style={inputStyle} />
                  </Field>
                </SectionBlock>

                <SectionBlock
                  icon={<CreditCard size={15} />}
                  title="Commercial"
                  description="Plan, go-live state, brand colour, and payout configuration."
                >
                  <Field label="Plan">
                    <select value={form.plan || 'basic'} onChange={(e) => setForm((prev) => ({ ...prev, plan: e.target.value }))} style={inputStyle}>
                      <option value="basic">basic</option>
                      <option value="pro">pro</option>
                      <option value="premium">premium</option>
                    </select>
                  </Field>
                  <Field label="Status">
                    <select value={form.status || 'active'} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))} style={inputStyle}>
                      <option value="pending">pending</option>
                      <option value="active">active</option>
                      <option value="suspended">suspended</option>
                    </select>
                  </Field>
                  <Field label="Brand colour">
                    <input value={form.primary_color || '#D7B24E'} onChange={(e) => setForm((prev) => ({ ...prev, primary_color: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Commission %">
                    <input type="number" step="0.1" min="0" max="100" value={form.commission_rate ?? 0.5} onChange={(e) => setForm((prev) => ({ ...prev, commission_rate: Number(e.target.value) }))} style={inputStyle} />
                  </Field>
                  <Field label="Stripe connected account">
                    <input value={form.stripe_account_id || ''} onChange={(e) => setForm((prev) => ({ ...prev, stripe_account_id: e.target.value }))} style={inputStyle} placeholder="acct_..." />
                  </Field>
                </SectionBlock>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>
                  Order page: <span style={{ color: 'var(--admin-text)', fontWeight: 600 }}>{restaurant.slug ? `/order/${restaurant.slug}` : 'Not set'}</span>
                </div>
                <button type="submit" disabled={saving} style={primaryButton}>
                  <Save size={14} />
                  {saving ? 'Saving...' : 'Save restaurant'}
                </button>
              </div>
            </form>
          </section>
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          <section style={panel}>
            <div style={sectionHeader}>
              <div>
                <div style={sectionKicker}>Access</div>
                <h2 style={sectionTitle}>Staff login accounts</h2>
              </div>
              <div style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>
                Create credentials for managers, staff, or kitchen-only users.
              </div>
            </div>

            {accountError ? <Banner tone="danger" message={accountError} compact /> : null}
            {accountMessage ? <Banner tone="success" message={accountMessage} compact /> : null}

            <form onSubmit={handleCreateAccount} style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
              <Field label="Full name">
                <input
                  value={accountForm.fullName}
                  onChange={(e) => setAccountForm((prev) => ({ ...prev, fullName: e.target.value }))}
                  style={inputStyle}
                  placeholder="Primary operator"
                />
              </Field>
              <Field label="Username / email">
                <input
                  value={accountForm.email}
                  onChange={(e) => setAccountForm((prev) => ({ ...prev, email: e.target.value }))}
                  style={inputStyle}
                  placeholder="manager@restaurant.com"
                />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
                <Field label="Temporary password">
                  <input
                    type="text"
                    value={accountForm.password}
                    onChange={(e) => setAccountForm((prev) => ({ ...prev, password: e.target.value }))}
                    style={inputStyle}
                    placeholder="Minimum 10 characters"
                  />
                </Field>
                <button type="button" onClick={fillGeneratedPassword} style={{ ...secondaryButton, alignSelf: 'end' }}>
                  <Sparkles size={14} />
                  Generate
                </button>
              </div>
              <Field label="Role">
                <select
                  value={accountForm.role}
                  onChange={(e) => setAccountForm((prev) => ({ ...prev, role: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="manager">manager</option>
                  <option value="staff">staff</option>
                  <option value="kitchen">kitchen</option>
                </select>
              </Field>
              <div style={roleCard}>
                <div style={{ color: 'var(--admin-text)', fontWeight: 600 }}>{ROLE_LABELS[accountForm.role]}</div>
                <div style={{ color: 'var(--admin-text-soft)', fontSize: 13 }}>{ROLE_DESCRIPTIONS[accountForm.role]}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="submit" disabled={accountBusy} style={primaryButton}>
                  <UsersRound size={14} />
                  {accountBusy ? 'Creating...' : 'Create login'}
                </button>
                <button
                  type="button"
                  disabled={!accountForm.email || !accountForm.password}
                  onClick={() => copyCredentials(accountForm.email.trim().toLowerCase(), accountForm.password)}
                  style={secondaryButton}
                >
                  <Copy size={14} />
                  Copy credentials
                </button>
              </div>
            </form>

            <div style={{ display: 'grid', gap: 12 }}>
              {accounts.length === 0 ? (
                <div style={emptyState}>
                  <LockKeyhole size={18} />
                  <div>No login accounts linked to this restaurant yet.</div>
                </div>
              ) : accounts.map((account) => (
                <div key={account.id} style={accountCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ color: 'var(--admin-text)', fontSize: 14, fontWeight: 600 }}>{account.full_name || account.email || 'Restaurant user'}</div>
                      <div style={{ color: 'var(--admin-text-soft)', fontSize: 12, marginTop: 4 }}>{account.email || 'No email found'}</div>
                    </div>
                    <StatusBadge tone="neutral">{ROLE_LABELS[account.role] || account.role}</StatusBadge>
                  </div>
                  <div style={{ color: 'var(--admin-text-muted)', fontSize: 12 }}>
                    Last sign-in: {account.last_sign_in_at ? new Date(account.last_sign_in_at).toLocaleString() : 'Never'}
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ color: 'var(--admin-text-soft)', fontSize: 12 }}>{ROLE_DESCRIPTIONS[account.role] || 'Role access not documented.'}</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        value={passwordForm[account.user_id] || ''}
                        onChange={(e) => setPasswordForm((current) => ({ ...current, [account.user_id]: e.target.value }))}
                        style={{ ...inputStyle, flex: '1 1 220px' }}
                        placeholder="New password"
                      />
                      <button
                        type="button"
                        disabled={accountBusy || !(passwordForm[account.user_id] || '').trim()}
                        onClick={() => handleResetPassword(account)}
                        style={secondaryButton}
                      >
                        <KeyRound size={14} />
                        Reset password
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={panel}>
            <div style={sectionHeader}>
              <div>
                <div style={sectionKicker}>Operations</div>
                <h2 style={sectionTitle}>Recent orders</h2>
              </div>
              <div style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>Paid volume: £{paidRevenue.toFixed(2)}</div>
            </div>
            {orders.length === 0 ? (
              <div style={emptyState}>
                <AlertCircle size={18} />
                <div>No orders yet.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {orders.slice(0, 8).map((order) => (
                  <div key={order.id} style={orderRow}>
                    <div>
                      <div style={{ color: 'var(--admin-text)', fontSize: 14, fontWeight: 600 }}>#{order.order_number}</div>
                      <div style={{ color: 'var(--admin-text-soft)', fontSize: 12, marginTop: 4 }}>{order.customer_name}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: 'var(--admin-text)', fontSize: 14, fontWeight: 600 }}>£{Number(order.total).toFixed(2)}</div>
                      <div style={{ color: 'var(--admin-text-muted)', fontSize: 12, marginTop: 4 }}>{order.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function SectionBlock({ icon, title, description, children }) {
  return (
    <div style={sectionBlock}>
      <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--admin-text)' }}>
          <span style={sectionIcon}>{icon}</span>
          <div style={{ fontWeight: 600 }}>{title}</div>
        </div>
        <div style={{ color: 'var(--admin-text-soft)', fontSize: 13 }}>{description}</div>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>{children}</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <span style={{ color: 'var(--admin-text-muted)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{label}</span>
      {children}
    </label>
  )
}

function Banner({ tone = 'danger', message, compact = false }) {
  const toneMap = {
    danger: {
      background: 'var(--admin-danger-soft)',
      border: 'color-mix(in srgb, var(--admin-danger) 45%, transparent)',
      color: 'var(--admin-danger)',
      icon: <AlertCircle size={14} />,
    },
    success: {
      background: 'var(--admin-success-soft)',
      border: 'color-mix(in srgb, var(--admin-success) 45%, transparent)',
      color: 'var(--admin-success)',
      icon: <CheckCircle2 size={14} />,
    },
  }
  const current = toneMap[tone] || toneMap.danger
  return (
    <div style={{
      background: current.background,
      border: `1px solid ${current.border}`,
      color: current.color,
      borderRadius: 12,
      padding: compact ? '11px 14px' : '12px 16px',
      marginBottom: compact ? 14 : 0,
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      fontSize: 14,
    }}>
      {current.icon}
      <span>{message}</span>
    </div>
  )
}

function StatusBadge({ tone = 'neutral', children }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      padding: '6px 10px',
      fontSize: 12,
      fontWeight: 600,
      background: toneBackground(tone),
      color: toneColor(tone),
      border: `1px solid ${toneBorder(tone)}`,
    }}>
      {children}
    </span>
  )
}

function Loader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <div style={{ width: 28, height: 28, border: '2px solid var(--admin-border)', borderTop: '2px solid var(--admin-accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function toneColor(tone) {
  if (tone === 'success') return 'var(--admin-success)'
  if (tone === 'danger') return 'var(--admin-danger)'
  if (tone === 'warning') return 'var(--admin-accent)'
  return 'var(--admin-text-soft)'
}

function toneBackground(tone) {
  if (tone === 'success') return 'var(--admin-success-soft)'
  if (tone === 'danger') return 'var(--admin-danger-soft)'
  if (tone === 'warning') return 'var(--admin-accent-soft)'
  return 'color-mix(in srgb, var(--admin-panel-alt) 88%, transparent)'
}

function toneBorder(tone) {
  if (tone === 'success') return 'color-mix(in srgb, var(--admin-success) 40%, transparent)'
  if (tone === 'danger') return 'color-mix(in srgb, var(--admin-danger) 40%, transparent)'
  if (tone === 'warning') return 'color-mix(in srgb, var(--admin-accent) 38%, transparent)'
  return 'var(--admin-border)'
}

function isToday(dateValue) {
  if (!dateValue) return false
  const date = new Date(dateValue)
  const now = new Date()
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
}

const heroCard = {
  background: 'linear-gradient(135deg, color-mix(in srgb, var(--admin-panel) 92%, white 8%), var(--admin-panel-alt))',
  border: '1px solid var(--admin-border)',
  borderRadius: 18,
  padding: 24,
  display: 'grid',
  gap: 24,
}

const backLink = {
  color: 'var(--admin-text-soft)',
  textDecoration: 'none',
  fontSize: 13,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const brandMark = {
  width: 46,
  height: 46,
  borderRadius: 14,
  background: 'var(--admin-accent-soft)',
  color: 'var(--admin-accent)',
  display: 'grid',
  placeItems: 'center',
  border: '1px solid color-mix(in srgb, var(--admin-accent) 30%, transparent)',
}

const pageTitle = {
  color: 'var(--admin-text)',
  fontSize: 32,
  lineHeight: 1,
  fontWeight: 600,
  margin: 0,
  fontFamily: "'Cormorant Garamond', serif",
}

const subtleRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  color: 'var(--admin-text-soft)',
  fontSize: 13,
  marginTop: 8,
}

const statsGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 14,
}

const metricCard = {
  background: 'color-mix(in srgb, var(--admin-panel-alt) 88%, transparent)',
  border: '1px solid var(--admin-border)',
  borderRadius: 14,
  padding: 16,
}

const metricLabel = {
  color: 'var(--admin-text-muted)',
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  marginBottom: 8,
}

const metricValue = {
  color: 'var(--admin-text)',
  fontSize: 20,
  fontWeight: 600,
}

const metricHint = {
  color: 'var(--admin-text-soft)',
  fontSize: 13,
  marginTop: 6,
}

const contentGrid = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.2fr) minmax(340px, 0.8fr)',
  gap: 20,
  alignItems: 'start',
}

const panel = {
  background: 'var(--admin-panel)',
  border: '1px solid var(--admin-border)',
  borderRadius: 18,
  padding: 22,
  display: 'grid',
  gap: 18,
}

const sectionHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  alignItems: 'flex-start',
  flexWrap: 'wrap',
}

const sectionKicker = {
  color: 'var(--admin-text-muted)',
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  marginBottom: 6,
}

const sectionTitle = {
  color: 'var(--admin-text)',
  fontSize: 22,
  lineHeight: 1.05,
  fontWeight: 600,
  margin: 0,
}

const checklistWrap = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
}

const checklistItem = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'var(--admin-panel-alt)',
  border: '1px solid var(--admin-border)',
  color: 'var(--admin-text-soft)',
  fontSize: 13,
}

const formSectionGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 18,
}

const sectionBlock = {
  background: 'var(--admin-panel-alt)',
  border: '1px solid var(--admin-border)',
  borderRadius: 16,
  padding: 18,
}

const sectionIcon = {
  width: 30,
  height: 30,
  borderRadius: 10,
  background: 'var(--admin-accent-soft)',
  color: 'var(--admin-accent)',
  display: 'grid',
  placeItems: 'center',
}

const roleCard = {
  padding: '12px 14px',
  borderRadius: 12,
  background: 'var(--admin-panel-alt)',
  border: '1px solid var(--admin-border)',
  display: 'grid',
  gap: 4,
}

const accountCard = {
  border: '1px solid var(--admin-border)',
  background: 'var(--admin-panel-alt)',
  borderRadius: 14,
  padding: 14,
  display: 'grid',
  gap: 12,
}

const orderRow = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid var(--admin-border)',
  background: 'var(--admin-panel-alt)',
}

const emptyState = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  color: 'var(--admin-text-soft)',
  border: '1px dashed var(--admin-border)',
  borderRadius: 14,
  padding: '16px 14px',
}

const inputStyle = {
  width: '100%',
  background: 'var(--admin-input)',
  border: '1px solid var(--admin-border)',
  borderRadius: 10,
  padding: '12px 13px',
  color: 'var(--admin-text)',
  fontSize: 14,
  fontFamily: "'Outfit', sans-serif",
  boxSizing: 'border-box',
}

const primaryButton = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  background: 'var(--admin-accent)',
  color: '#20180a',
  border: 'none',
  borderRadius: 10,
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

const secondaryButton = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  background: 'var(--admin-panel-alt)',
  color: 'var(--admin-text)',
  border: '1px solid var(--admin-border)',
  borderRadius: 10,
  padding: '12px 14px',
  fontSize: 14,
  cursor: 'pointer',
}
