import { useRealtimeEvents } from './useRealtimeEvents'

// SSE 구독 훅을 마운트하기 위한 헤드리스 컴포넌트.
// App 의 BrowserRouter 안에 정확히 1번 렌더해 라우트 전환에 영향받지 않게 한다.
export function RealtimeBridge() {
  useRealtimeEvents()
  return null
}
