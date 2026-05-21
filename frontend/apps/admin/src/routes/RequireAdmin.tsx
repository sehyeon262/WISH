import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../shared/auth/store'

type Props = {
  children: React.ReactNode
}

export function RequireAdmin({ children }: Props) {
  const { token, isAdmin } = useAuthStore()
  const location = useLocation()

  if (!token || !isAdmin) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <>{children}</>
}
