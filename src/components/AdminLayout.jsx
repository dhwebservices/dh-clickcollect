import { useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Store, ShoppingBag, TrendingUp, LogOut, Moon, SunMedium } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const ADMIN_THEME_KEY = 'dh-clickcollect:admin-theme'

const THEME_TOKENS = {
  dark: {
    '--admin-bg': '#121212',
    '--admin-bg-muted': '#171717',
    '--admin-panel': '#1b1b1b',
    '--admin-panel-alt': '#202020',
    '--admin-border': '#2f2f2f',
    '--admin-text': '#f3efe4',
    '--admin-text-soft': '#beb5a3',
    '--admin-text-muted': '#8e8678',
    '--admin-accent': '#d7b24e',
    '--admin-accent-soft': 'rgba(215, 178, 78, 0.14)',
    '--admin-danger': '#f0a8a1',
    '--admin-danger-soft': 'rgba(220, 84, 71, 0.14)',
    '--admin-success': '#9ed3ae',
    '--admin-success-soft': 'rgba(72, 187, 120, 0.14)',
    '--admin-input': '#161616',
  },
  light: {
    '--admin-bg': '#f5f1e8',
    '--admin-bg-muted': '#ece6da',
    '--admin-panel': '#ffffff',
    '--admin-panel-alt': '#f8f3ea',
    '--admin-border': '#ddd0ba',
    '--admin-text': '#211c14',
    '--admin-text-soft': '#5f5340',
    '--admin-text-muted': '#847764',
    '--admin-accent': '#b78e24',
    '--admin-accent-soft': 'rgba(183, 142, 36, 0.12)',
    '--admin-danger': '#b44f42',
    '--admin-danger-soft': 'rgba(180, 79, 66, 0.11)',
    '--admin-success': '#207b53',
    '--admin-success-soft': 'rgba(32, 123, 83, 0.12)',
    '--admin-input': '#fffdf8',
  }
}

export default function AdminLayout({ children }) {
  const { user, signOut, impersonation, stopImpersonation } = useAuth()
  const navigate = useNavigate()
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark'
    return window.localStorage.getItem(ADMIN_THEME_KEY) || 'dark'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(ADMIN_THEME_KEY, theme)
  }, [theme])

  const themeVars = useMemo(() => THEME_TOKENS[theme] || THEME_TOKENS.dark, [theme])

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
    <div style={{ ...themeVars, display: 'flex', minHeight: '100vh', background: 'var(--admin-bg)', color: 'var(--admin-text)', fontFamily: "'Outfit', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Outfit:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <aside style={{
        width: 248,
        background: 'var(--admin-bg-muted)',
        borderRight: '1px solid var(--admin-border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100vh',
        zIndex: 100
      }}>
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--admin-border)' }}>
          <div style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--admin-accent)',
            marginBottom: 4
          }}>
            DH Click & Collect
          </div>
          <div style={{ color: 'var(--admin-text-muted)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
            PLATFORM ADMIN
          </div>
          {user && (
            <div style={{ marginTop: 10, color: 'var(--admin-text-soft)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                color: isActive ? 'var(--admin-accent)' : 'var(--admin-text-muted)',
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: isActive ? 500 : 400,
                background: isActive ? 'var(--admin-accent-soft)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--admin-accent)' : '2px solid transparent'
              })}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '18px 20px', borderTop: '1px solid var(--admin-border)', display: 'grid', gap: 10 }}>
          <button
            type="button"
            onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: 'var(--admin-text-soft)',
              background: 'var(--admin-panel)',
              border: '1px solid var(--admin-border)',
              borderRadius: 10,
              cursor: 'pointer',
              fontSize: 13,
              padding: '10px 14px',
              fontFamily: "'Outfit', sans-serif"
            }}
          >
            {theme === 'dark' ? <SunMedium size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>

          {impersonation && (
            <button
              type="button"
              onClick={stopImpersonation}
              style={{
                background: 'transparent',
                border: '1px solid color-mix(in srgb, var(--admin-accent) 35%, transparent)',
                color: 'var(--admin-accent)',
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
              color: 'var(--admin-text-soft)',
              background: 'none',
              border: '1px solid var(--admin-border)',
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
            background: 'var(--admin-accent-soft)',
            borderBottom: '1px solid color-mix(in srgb, var(--admin-accent) 35%, transparent)',
            padding: '14px 32px',
            color: 'var(--admin-accent)',
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
