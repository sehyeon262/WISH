import { create } from 'zustand'

// 활성 LoginSession 의 식별자를 게임 외부 모듈(예: realtime publisher) 이 구독할 수 있게
// 노출하는 store. useLoginSession 이 start 응답을 받자마자 set 하고 cleanup/end 시 clear 한다.
//
// 기존 useLoginSession 은 sessionIdRef 를 hook 내부에만 들고 있어 LiveKit 연결 모듈이
// sessionId 를 알 방법이 없었음 — 이 store 가 그 brige.
type LoginSessionState = {
  loginSessionId: number | null
  patientProfileId: number | null
  setSession: (loginSessionId: number, patientProfileId: number) => void
  clearSession: () => void
}

export const useLoginSessionStore = create<LoginSessionState>(set => ({
  loginSessionId: null,
  patientProfileId: null,
  setSession: (loginSessionId, patientProfileId) => set({ loginSessionId, patientProfileId }),
  clearSession: () => set({ loginSessionId: null, patientProfileId: null }),
}))
