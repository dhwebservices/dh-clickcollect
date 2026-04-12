import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { RestaurantProvider } from './contexts/RestaurantContext'
import {
  RequireRestaurantAuth,
  RequireAdminAuth,
  RequireDashboardAccess,
  RequireKitchenAccess
} from './components/Guards'
import DashboardLayout from './components/DashboardLayout'
import AdminLayout from './components/AdminLayout'

import Login from './pages/Login'
import AdminLogin from './pages/admin/AdminLogin'

import AdminDashboard from './pages/admin/AdminDashboard'
import Restaurants from './pages/admin/Restaurants'
import RestaurantDetail from './pages/admin/RestaurantDetail'
import AdminOrders from './pages/admin/AdminOrders'
import AdminRevenue from './pages/admin/AdminRevenue'

import RestaurantOverview from './pages/dashboard/RestaurantOverview'
import LiveOrders from './pages/dashboard/LiveOrders'
import KitchenView from './pages/dashboard/KitchenView'
import MenuEditor from './pages/dashboard/MenuEditor'
import Hours from './pages/dashboard/Hours'
import Reports from './pages/dashboard/Reports'

import OrderPage from './pages/order/OrderPage'
import Checkout from './pages/order/Checkout'
import OrderConfirmation from './pages/order/OrderConfirmation'

export default function App() {
  return (
    <AuthProvider>
      <RestaurantProvider>
        <Routes>
          <Route path="/order/:slug" element={<OrderPage />} />
          <Route path="/order/:slug/checkout" element={<Checkout />} />
          <Route path="/order/:slug/confirmation" element={<OrderConfirmation />} />

          <Route path="/login" element={<Login />} />
          <Route path="/admin/login" element={<AdminLogin />} />

          <Route
            path="/dashboard/*"
            element={
              <RequireRestaurantAuth>
                <RequireDashboardAccess>
                  <DashboardLayout>
                    <Routes>
                      <Route index element={<RestaurantOverview />} />
                      <Route path="orders" element={<LiveOrders />} />
                      <Route path="menu" element={<MenuEditor />} />
                      <Route path="hours" element={<Hours />} />
                      <Route path="reports" element={<Reports />} />
                    </Routes>
                  </DashboardLayout>
                </RequireDashboardAccess>
              </RequireRestaurantAuth>
            }
          />

          <Route
            path="/kitchen"
            element={
              <RequireRestaurantAuth>
                <RequireKitchenAccess>
                  <KitchenView />
                </RequireKitchenAccess>
              </RequireRestaurantAuth>
            }
          />

          <Route
            path="/admin/*"
            element={
              <RequireAdminAuth>
                <AdminLayout>
                  <Routes>
                    <Route index element={<AdminDashboard />} />
                    <Route path="restaurants" element={<Restaurants />} />
                    <Route path="restaurants/:id" element={<RestaurantDetail />} />
                    <Route path="orders" element={<AdminOrders />} />
                    <Route path="revenue" element={<AdminRevenue />} />
                  </Routes>
                </AdminLayout>
              </RequireAdminAuth>
            }
          />

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </RestaurantProvider>
    </AuthProvider>
  )
}
