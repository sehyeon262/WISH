import { useQuery } from '@tanstack/react-query'
import { listPatientProfiles, type PatientProfile } from '@wish/api-client'
import { useAuthStore } from '@/shared/auth/store'

export const MY_PATIENT_QUERY_KEY = 'my-patient'

export function useMyPatient() {
  const token = useAuthStore(s => s.token)
  return useQuery<PatientProfile | null>({
    queryKey: [MY_PATIENT_QUERY_KEY, token],
    queryFn: async () => {
      const response = await listPatientProfiles()
      return response.data[0] ?? null
    },
    enabled: !!token,
    staleTime: Infinity,
  })
}

export function calcKoreanAge(birthDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1
  }
  return age >= 0 ? age : null
}
