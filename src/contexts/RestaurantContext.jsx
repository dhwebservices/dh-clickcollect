import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { sbGetOne } from '../lib/supabase'

const RestaurantContext = createContext(null)

export function RestaurantProvider({ children }) {
  const { primaryMembership, impersonation, isAdmin } = useAuth()
  const [restaurant, setRestaurant] = useState(null)
  const [loadingRestaurant, setLoadingRestaurant] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const restaurantId = impersonation?.restaurantId || primaryMembership?.restaurant_id
    if (!restaurantId) {
      setRestaurant(null)
      setError(null)
      return
    }
    loadRestaurant(restaurantId)
  }, [primaryMembership?.restaurant_id, primaryMembership?.role, impersonation?.restaurantId])

  async function loadRestaurant(restaurantId) {
    setLoadingRestaurant(true)
    setError(null)
    try {
      const r = await sbGetOne('restaurants', {
        eq: { id: restaurantId }
      })
      if (!r) throw new Error('Restaurant not found')

      const accessRole = impersonation?.restaurantId
        ? 'manager'
        : primaryMembership?.role || null

      setRestaurant({
        ...r,
        userRole: accessRole,
        accessMode: impersonation?.restaurantId ? 'impersonation' : 'direct',
        impersonatedByAdmin: !!(impersonation?.restaurantId && isAdmin)
      })
    } catch (err) {
      setError(err.message)
      setRestaurant(null)
    } finally {
      setLoadingRestaurant(false)
    }
  }

  async function refreshRestaurant() {
    const restaurantId = impersonation?.restaurantId || primaryMembership?.restaurant_id
    if (restaurantId) {
      await loadRestaurant(restaurantId)
    }
  }

  return (
    <RestaurantContext.Provider value={{
      restaurant,
      loadingRestaurant,
      error,
      refreshRestaurant
    }}>
      {children}
    </RestaurantContext.Provider>
  )
}

export function useRestaurant() {
  return useContext(RestaurantContext)
}
