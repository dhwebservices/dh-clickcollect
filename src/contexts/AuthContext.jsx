import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  supabaseAuth,
  setSessionToken,
  setAdminBridgeSession,
  sbGet
} from '../lib/supabase'
import { msalInstance, loginRequest, isAllowedAccount } from '../lib/msal'

const AuthContext = createContext(null)
const IMPERSONATION_KEY = 'dh-clickcollect:impersonation'
const ADMIN_SESSION_KEY = 'dh-clickcollect:admin-session'

function readJson(key) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return
  if (!value) {
    window.localStorage.removeItem(key)
    return
  }
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [restaurantMemberships, setRestaurantMemberships] = useState([])
  const [impersonation, setImpersonation] = useState(() => readJson(IMPERSONATION_KEY))
  const [adminSession, setAdminSession] = useState(() => readJson(ADMIN_SESSION_KEY))

  useEffect(() => {
    supabaseAuth.auth.getSession().then(async ({ data: { session } }) => {
      await hydrateRestaurantSession(session)
      await restoreAdminSession()
      setLoadingAuth(false)
    })

    const { data: { subscription } } = supabaseAuth.auth.onAuthStateChange(
      async (_event, session) => {
        await hydrateRestaurantSession(session)
        setLoadingAuth(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    writeJson(IMPERSONATION_KEY, impersonation)
    setAdminBridgeSession(adminSession?.token ? {
      token: adminSession.token,
      impersonationRestaurantId: impersonation?.restaurantId || null
    } : null)
  }, [impersonation, adminSession])

  useEffect(() => {
    writeJson(ADMIN_SESSION_KEY, adminSession)
  }, [adminSession])

  async function restoreAdminSession() {
    const cached = readJson(ADMIN_SESSION_KEY)
    if (!cached?.token) {
      setAdminSession(null)
      return
    }

    try {
      await msalInstance.initialize()
      const accounts = msalInstance.getAllAccounts()
      const account = accounts.find((item) => item.homeAccountId === cached.accountId) || accounts[0]
      if (!account || !isAllowedAccount(account)) {
        setAdminSession(null)
        return
      }

      const verified = await verifyAdminToken(cached.token)
      setAdminSession({
        token: cached.token,
        accountId: account.homeAccountId,
        email: verified.email,
        name: verified.name
      })
    } catch {
      setAdminSession(null)
    }
  }

  async function hydrateRestaurantSession(session) {
    if (!session) {
      setUser(null)
      setRestaurantMemberships([])
      setSessionToken(null)
      return
    }

    setUser(session.user)
    setSessionToken(session.access_token)

    try {
      const memberships = await sbGet('restaurant_users', {
        eq: { user_id: session.user.id },
        order: 'created_at.asc'
      }).catch(() => [])

      setRestaurantMemberships(memberships)
    } catch {
      setRestaurantMemberships([])
    }
  }

  async function signInRestaurant(email, password) {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password
    })
    if (error) throw error
    return data
  }

  async function signInAdmin() {
    await msalInstance.initialize()
    let result
    try {
      result = await msalInstance.loginPopup(loginRequest)
    } catch (error) {
      throw new Error(error?.message || 'Microsoft sign in failed')
    }

    if (!isAllowedAccount(result.account)) {
      await msalInstance.logoutPopup({ account: result.account })
      throw new Error('Access restricted to DH Microsoft accounts')
    }

    const verified = await verifyAdminToken(result.idToken)
    setAdminSession({
      token: result.idToken,
      accountId: result.account.homeAccountId,
      email: verified.email,
      name: verified.name
    })

    return verified
  }

  async function verifyAdminToken(idToken) {
    const workerUrl = import.meta.env.VITE_WORKER_URL
    if (!workerUrl) {
      throw new Error('Admin worker URL is not configured. Set VITE_WORKER_URL in Cloudflare Pages.')
    }

    let res
    try {
      res = await fetch(`${workerUrl}/admin/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        }
      })
    } catch (error) {
      throw new Error(`Could not reach admin worker at ${workerUrl}. Check the Worker URL and deployment.`)
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || err.message || `Admin verification failed (${res.status})`)
    }

    const payload = await res.json()
    return payload.data
  }

  async function signOutRestaurant() {
    await supabaseAuth.auth.signOut()
    setUser(null)
    setRestaurantMemberships([])
    setSessionToken(null)
  }

  async function signOutAdmin() {
    await msalInstance.initialize()
    const accounts = msalInstance.getAllAccounts()
    const account = accounts.find((item) => item.homeAccountId === adminSession?.accountId) || accounts[0]
    if (account) {
      await msalInstance.logoutPopup({ account })
    }
    setAdminSession(null)
    setImpersonation(null)
  }

  async function signOut() {
    if (adminSession) {
      await signOutAdmin()
    }
    if (user) {
      await signOutRestaurant()
    }
  }

  function startImpersonation(restaurant) {
    setImpersonation({
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      startedAt: new Date().toISOString()
    })
  }

  function stopImpersonation() {
    setImpersonation(null)
  }

  const primaryMembership = restaurantMemberships[0] || null
  const adminUser = adminSession ? {
    email: adminSession.email,
    username: adminSession.email,
    name: adminSession.name
  } : null

  const value = useMemo(() => ({
    user,
    restaurantUser: user,
    adminUser,
    adminProfile: adminSession,
    restaurantMemberships,
    primaryMembership,
    impersonation,
    loadingAuth,
    isAdmin: !!adminSession,
    isRestaurantStaff: restaurantMemberships.length > 0,
    hasRestaurantRole: (...roles) => restaurantMemberships.some(
      (membership) => roles.includes(membership.role)
    ),
    signInRestaurant,
    signInAdmin,
    signOut,
    signOutRestaurant,
    signOutAdmin,
    startImpersonation,
    stopImpersonation
  }), [user, adminSession, restaurantMemberships, primaryMembership, impersonation, loadingAuth])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
