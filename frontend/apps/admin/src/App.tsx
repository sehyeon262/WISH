import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { MotionsPage } from './pages/MotionsPage'
import { PatientDashboardPage } from './pages/PatientDashboardPage'
import { TaekwondoMotionsPage } from './pages/TaekwondoMotionsPage'
import { UsersPage } from './pages/UsersPage'
import { RequireAdmin } from './routes/RequireAdmin'

function App() {
  const basename = import.meta.env.VITE_APP_BASE_PATH ?? '/'
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireAdmin>
              <DashboardPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/dashboard/patients/:patientId"
          element={
            <RequireAdmin>
              <PatientDashboardPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/motions"
          element={
            <RequireAdmin>
              <MotionsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/users"
          element={
            <RequireAdmin>
              <UsersPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/taekwondo-motions"
          element={
            <RequireAdmin>
              <TaekwondoMotionsPage />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
