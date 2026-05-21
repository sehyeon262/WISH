import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getFuelStatus, sendFuel, type FuelSendRequest } from '@wish/api-client'

export const FUEL_STATUS_QUERY_KEY = 'fuel-status'

export function useFuelStatus() {
  return useQuery({
    queryKey: [FUEL_STATUS_QUERY_KEY],
    queryFn: async () => {
      const response = await getFuelStatus()
      return response.data
    },
  })
}

export function useSendFuel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: FuelSendRequest) => sendFuel(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FUEL_STATUS_QUERY_KEY] })
    },
  })
}
