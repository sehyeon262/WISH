import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/shared/auth/store'

type Props = {
  children: React.ReactNode
}

export function RequireAuth({ children }: Props) {
  const { token } = useAuthStore()
  const location = useLocation()

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <>{children}</>
}
