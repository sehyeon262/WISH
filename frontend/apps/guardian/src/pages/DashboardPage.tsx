import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout'
import { HeaderBar } from '@/features/dashboard/components/HeaderBar'
import {
  OverallScoreCard,
  ROMSummaryCard,
  TrendChartCard,
} from '@/features/dashboard/components/InsightCards'
import { MovementProgressCard } from '@/features/dashboard/components/MovementProgressCard'
import { SessionRow } from '@/features/dashboard/components/SessionRow'
import '@/features/dashboard/tokens.css'

export function DashboardPage() {
  return (
    <DashboardLayout
      header={<HeaderBar />}
      movementCard={<MovementProgressCard />}
      insightPanel={
        <>
          <OverallScoreCard />
          <TrendChartCard />
          <ROMSummaryCard />
        </>
      }
      bottomRow={<SessionRow />}
    />
  )
}
