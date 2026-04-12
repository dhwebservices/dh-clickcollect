import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabaseAuth, setSessionToken, sbGet } from '../lib/supabase'

const AuthContext = createContext(null)
const IMPERSONATION_KEY = 'dh-clickcollect:impersonation'

function readImpersonation() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(IMPERSONATION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeImpersonation(value) {
  if (typeof window === 'undefined') return
  if (!value) {
    window.localStorage.removeItem(IMPERSONATION_KEY)
    return
  }
  window.localStorage.setItem(IMPERSONATION_KEY, JSON.stringify(value))
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [adminProfile, setAdminProfile] = useState(null)
  const [restaurantMemberships, setRestaurantMemberships] = useState([])
  const [impersonation, setImpersonation] = useState(() => readImpersonation())

  useEffect(() => {
    supabaseAuth.auth.getSession().then(async ({ data: { session } }) => {
      await hydrateSession(session)
      setLoadingAuth(false)
    })

    const { data: { subscription } } = supabaseAuth.auth.onAuthStateChange(
      async (_event, session) => {
        await hydrateSession(session)
        setLoadingAuth(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    writeImpersonation(impersonation)
  }, [impersonation])

  async function hydrateSession(session) {
    if (!session) {
      setUser(null)
      setAdminProfile(null)
      setRestaurantMemberships([])
      setImpersonation(null)
      setSessionToken(null)
      return
    }

    setUser(session.user)
    setSessionToken(session.access_token)

    try {
      const [admins, memberships] = await Promise.all([
        sbGet('platform_admins', {
          eq: { user_id: session.user.id },
          limit: 1
        }).catch(() => []),
        sbGet('restaurant_users', {
          eq: { user_id: session.user.id },
          order: 'created_at.asc'
        }).catch(() => [])
      ])

      setAdminProfile(admins[0] || null)
      setRestaurantMemberships(memberships)

      if (!(admins[0] || null)) {
        setImpersonation(null)
      }
    } catch {
      setAdminProfile(null)
      setRestaurantMemberships([])
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password
    })
    if (error) throw error
    return data
  }

  async function signInAdmin(email, password) {
    const data = await signIn(email, password)
    const accessToken = data?.session?.access_token
    const userId = data?.user?.id

    if (!accessToken || !userId) {
      throw new Error('Admin sign in failed')
    }

    setSessionToken(accessToken)
    const admins = await sbGet('platform_admins', {
      eq: { user_id: userId },
      limit: 1
    }).catch(() => [])

    if (!admins[0]) {
      await supabaseAuth.auth.signOut()
      setSessionToken(null)
      throw new Error('This account is not registered as a platform admin')
    }

    return data
  }

  async function signOut() {
    await supabaseAuth.auth.signOut()
    setUser(null)
    setAdminProfile(null)
    setRestaurantMemberships([])
    setImpersonation(null)
    setSessionToken(null)
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

  const value = useMemo(() => ({
    user,
    restaurantUser: user,
    adminUser: user,
    adminProfile,
    restaurantMemberships,
    primaryMembership,
    impersonation,
    loadingAuth,
    isAdmin: !!adminProfile,
    isRestaurantStaff: restaurantMemberships.length > 0,
    hasRestaurantRole: (...roles) => restaurantMemberships.some(
      (membership) => roles.includes(membership.role)
    ),
    signIn,
    signInRestaurant: signIn,
    signInAdmin,
    signOut,
    signOutRestaurant: signOut,
    signOutAdmin: signOut,
    startImpersonation,
    stopImpersonation
  }), [user, adminProfile, restaurantMemberships, primaryMembership, impersonation, loadingAuth])

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
