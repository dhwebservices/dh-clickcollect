import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Store, ShoppingBag, TrendingUp, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function AdminLayout({ children }) {
  const { user, signOut, impersonation, stopImpersonation } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/admin/login')
  }

  const navItems = [
    { to: '/admin', icon: LayoutDashboard, label: 'Overview', end: true },
    { to: '/admin/restaurants', icon: Store, label: 'Restaurants' },
    { to: '/admin/orders', icon: ShoppingBag, label: 'Orders' },
    { to: '/admin/revenue', icon: TrendingUp, label: 'Revenue' }
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0a', fontFamily: "'Outfit', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Outfit:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <aside style={{
        width: 248,
        background: '#111',
        borderRight: '1px solid #1e1e1e',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100vh',
        zIndex: 100
      }}>
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid #1e1e1e' }}>
          <div style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 22,
            fontWeight: 600,
            color: '#C9A84C',
            marginBottom: 4
          }}>
            DH Click & Collect
          </div>
          <div style={{ color: '#555', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
            PLATFORM ADMIN
          </div>
          {user && (
            <div style={{ marginTop: 10, color: '#707070', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email}
            </div>
          )}
        </div>

        <nav style={{ flex: 1, padding: '14px 0' }}>
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 20px',
                color: isActive ? '#C9A84C' : '#6f6f6f',
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: isActive ? 500 : 400,
                background: isActive ? 'rgba(201,168,76,0.08)' : 'transparent',
                borderLeft: isActive ? '2px solid #C9A84C' : '2px solid transparent'
              })}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '18px 20px', borderTop: '1px solid #1e1e1e', display: 'grid', gap: 10 }}>
          {impersonation && (
            <button
              type="button"
              onClick={stopImpersonation}
              style={{
                background: 'transparent',
                border: '1px solid rgba(201,168,76,0.28)',
                color: '#C9A84C',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: "'Outfit', sans-serif"
              }}
            >
              Stop impersonating {impersonation.restaurantName}
            </button>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: '#666',
              background: 'none',
              border: '1px solid #222',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              padding: '10px 14px',
              fontFamily: "'Outfit', sans-serif"
            }}
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      <main style={{ marginLeft: 248, flex: 1, minHeight: '100vh' }}>
        {impersonation && (
          <div style={{
            background: 'rgba(201,168,76,0.08)',
            borderBottom: '1px solid rgba(201,168,76,0.22)',
            padding: '14px 32px',
            color: '#d8c27a',
            fontSize: 13
          }}>
            Impersonation prepared for {impersonation.restaurantName}. Open the restaurant workspace or kitchen screen from the restaurant detail page.
          </div>
        )}
        <div style={{ padding: '32px' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
