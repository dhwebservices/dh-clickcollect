import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function RequireRestaurantAuth({ children }) {
  const { isRestaurantStaff, isAdmin, impersonation, loadingAuth } = useAuth()
  const location = useLocation()

  if (loadingAuth) return <PageLoader />
  if (!(isRestaurantStaff || (isAdmin && impersonation))) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  return children
}

export function RequireDashboardAccess({ children }) {
  const { loadingAuth, isAdmin, impersonation, hasRestaurantRole } = useAuth()
  const location = useLocation()

  if (loadingAuth) return <PageLoader />
  if (isAdmin && impersonation) return children
  if (!hasRestaurantRole('manager', 'staff')) {
    return <Navigate to="/kitchen" state={{ from: location.pathname }} replace />
  }
  return children
}

export function RequireKitchenAccess({ children }) {
  const { loadingAuth, isAdmin, impersonation, hasRestaurantRole } = useAuth()
  const location = useLocation()

  if (loadingAuth) return <PageLoader />
  if (isAdmin && impersonation) return children
  if (!hasRestaurantRole('manager', 'staff', 'kitchen')) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  return children
}

export function RequireAdminAuth({ children }) {
  const { loadingAuth, isAdmin } = useAuth()
  const location = useLocation()

  if (loadingAuth) return <PageLoader />
  if (!isAdmin) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  }
  return children
}

function PageLoader() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        width: 32,
        height: 32,
        border: '2px solid #222',
        borderTop: '2px solid #C9A84C',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite'
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
