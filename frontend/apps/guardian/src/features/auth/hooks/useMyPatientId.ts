import { useQuery } from '@tanstack/react-query'
import { listPatientProfiles } from '@wish/api-client'
import { useAuthStore } from '@/shared/auth/store'

export const MY_PATIENT_ID_QUERY_KEY = 'my-patient-id'

export function useMyPatientId() {
  const token = useAuthStore(s => s.token)
  return useQuery({
    queryKey: [MY_PATIENT_ID_QUERY_KEY, token],
    queryFn: async () => {
      const response = await listPatientProfiles()
      return response.data[0]?.id ?? null
    },
    enabled: !!token,
    staleTime: Infinity,
  })
}
