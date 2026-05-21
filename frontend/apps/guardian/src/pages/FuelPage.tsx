import { useState } from 'react'
import { ChildPreviewCard } from '@/features/fuel/components/ChildPreviewCard'
import { FuelHeroCard } from '@/features/fuel/components/FuelHeroCard'
import { FuelLayout } from '@/features/fuel/components/FuelLayout'
import { WeeklyFuelLogCard } from '@/features/fuel/components/WeeklyFuelLogCard'
import { FUEL_OPTIONS, type FuelOptionId } from '@/features/fuel/data/mock'
import { useFuelStatus, useSendFuel } from '@/features/fuel/hooks'
import { HeaderBar } from '@/features/dashboard/components/HeaderBar'
import '@/features/dashboard/tokens.css'

const DEFAULT_MESSAGE = '오늘도 정말 잘했어, 천천히 같이 가보자.'

export function FuelPage() {
  const [selectedId, setSelectedId] = useState<FuelOptionId>('sparkle')
  const [customAmount, setCustomAmount] = useState<string>('')
  const [message, setMessage] = useState<string>(DEFAULT_MESSAGE)

  const { data: status } = useFuelStatus()
  const sendMutation = useSendFuel()

  const selectedOption = FUEL_OPTIONS.find(o => o.id === selectedId) ?? FUEL_OPTIONS[2]
  const resolvedAmount = selectedOption.amount ?? clampAmount(parseInt(customAmount, 10))

  const handleSend = () => {
    const trimmed = message.trim()
    if (resolvedAmount <= 0 || trimmed.length === 0) return
    sendMutation.mutate(
      { amount: resolvedAmount, message: trimmed },
      {
        onSuccess: () => {
          // 메시지/입력은 보낸 직후 초기화 — 게이지/주간 로그는 invalidate 로 자동 갱신.
          setMessage(DEFAULT_MESSAGE)
          setCustomAmount('')
        },
      },
    )
  }

  return (
    <FuelLayout
      header={<HeaderBar />}
      leftCard={
        <FuelHeroCard
          currentPercent={status?.percentage ?? 0}
          selectedId={selectedId}
          onSelect={setSelectedId}
          customAmount={customAmount}
          onCustomAmountChange={setCustomAmount}
          message={message}
          onMessageChange={setMessage}
          resolvedAmount={resolvedAmount}
          onSend={handleSend}
          isSending={sendMutation.isPending}
        />
      }
      rightStack={
        <>
          <ChildPreviewCard />
          <WeeklyFuelLogCard events={status?.events ?? []} />
        </>
      }
    />
  )
}

function clampAmount(value: number): number {
  if (Number.isNaN(value)) return 0
  if (value < 1) return 0
  if (value > 100) return 100
  return value
}
