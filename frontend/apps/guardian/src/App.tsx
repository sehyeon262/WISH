import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { RealtimeNotificationBridge } from './features/notifications'
import { RealtimeBridge } from './features/realtime'
import { ActivityPage } from './pages/ActivityPage'
import { ChatPage } from './pages/ChatPage'
import { DashboardPage } from './pages/DashboardPage'
import { FuelPage } from './pages/FuelPage'
import { LiveMonitorPage } from './pages/LiveMonitorPage'
import { LoginPage } from './pages/LoginPage'
import { ReportPage } from './pages/ReportPage'
import { ROMDetailPage } from './pages/ROMDetailPage'
import { SignupPage } from './pages/SignupPage'
import { RequireAuth } from './routes/RequireAuth'

function App() {
  const basename = import.meta.env.VITE_APP_BASE_PATH ?? '/'
  return (
    <BrowserRouter basename={basename}>
      <RealtimeBridge />
      <RealtimeNotificationBridge />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/rom"
          element={
            <RequireAuth>
              <ROMDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/chat"
          element={
            <RequireAuth>
              <ChatPage />
            </RequireAuth>
          }
        />
        <Route
          path="/activity"
          element={
            <RequireAuth>
              <ActivityPage />
            </RequireAuth>
          }
        />
        <Route
          path="/fuel"
          element={
            <RequireAuth>
              <FuelPage />
            </RequireAuth>
          }
        />
        <Route
          path="/live"
          element={
            <RequireAuth>
              <LiveMonitorPage />
            </RequireAuth>
          }
        />
        <Route
          path="/reports"
          element={
            <RequireAuth>
              <ReportPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
