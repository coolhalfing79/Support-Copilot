import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { UserLayout } from './layouts/UserLayout'
import { AdminLayout } from './layouts/AdminLayout'
import { ChatPage } from './pages/ChatPage'
import { ConversationsPage } from './pages/ConversationsPage'
import { GraphsPage } from './pages/GraphsPage'
import { TicketsLandingPage } from './pages/TicketsLandingPage'
import { LoginPage } from './pages/LoginPage'
import { AdminDashboard, KnowledgePage, TicketsPage, AdminFeedbackPage } from './pages/AdminPages'
import { UpdatesPage } from './pages/UpdatesPage'
import { FeedbackPage } from './pages/FeedbackPage'
import { SourcesPage } from './pages/SourcesPage'
import { useAuthStore } from './store/authStore'

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
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
                <ChatPage />
              </UserLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/conversations" 
          element={
            <ProtectedRoute>
              <UserLayout>
                <ConversationsPage />
              </UserLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/graph" 
          element={
            <ProtectedRoute>
              <UserLayout>
                <GraphsPage />
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
          path="/updates" 
          element={
            <ProtectedRoute>
              <UserLayout>
                <UpdatesPage />
              </UserLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/feedback" 
          element={
            <ProtectedRoute>
              <UserLayout>
                <FeedbackPage />
              </UserLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/sources" 
          element={
            <ProtectedRoute>
              <UserLayout>
                <SourcesPage />
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
            <ProtectedRoute>
              <AdminLayout>
                <AdminDashboard />
              </AdminLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin/knowledge" 
          element={
            <ProtectedRoute>
              <AdminLayout>
                <KnowledgePage />
              </AdminLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin/tickets" 
          element={
            <ProtectedRoute>
              <AdminLayout>
                <TicketsPage />
              </AdminLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin/feedback" 
          element={
            <ProtectedRoute>
              <AdminLayout>
                <AdminFeedbackPage />
              </AdminLayout>
            </ProtectedRoute>
          } 
        />
      </Routes>
    </Router>
  )
}

export default App
