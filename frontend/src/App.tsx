import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { UserLayout } from './layouts/UserLayout'
import { AdminLayout } from './layouts/AdminLayout'
import { ChatPage } from './pages/ChatPage'
import { TicketsLandingPage } from './pages/TicketsLandingPage'
import { LoginPage } from './pages/LoginPage'
import { AdminDashboard, KnowledgePage, TicketsPage } from './pages/AdminPages'
import { useAuthStore } from './store/authStore'

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  
  return <>{children}</>
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <UserLayout>
                <TicketsLandingPage />
              </UserLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/tickets" 
          element={
            <ProtectedRoute>
              <UserLayout>
                <TicketsLandingPage />
              </UserLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/chat/:sessionId" 
          element={
            <ProtectedRoute>
              <UserLayout>
                <ChatPage />
              </UserLayout>
            </ProtectedRoute>
          } 
        />
        
        {/* Admin Routes */}
        <Route 
          path="/admin" 
          element={
            <AdminRoute>
              <AdminLayout>
                <AdminDashboard />
              </AdminLayout>
            </AdminRoute>
          } 
        />
        <Route 
          path="/admin/knowledge" 
          element={
            <AdminRoute>
              <AdminLayout>
                <KnowledgePage />
              </AdminLayout>
            </AdminRoute>
          } 
        />
        <Route 
          path="/admin/tickets" 
          element={
            <AdminRoute>
              <AdminLayout>
                <TicketsPage />
              </AdminLayout>
            </AdminRoute>
          } 
        />
      </Routes>
    </Router>
  )
}

export default App
