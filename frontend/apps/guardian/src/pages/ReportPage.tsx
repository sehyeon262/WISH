import { useRef } from 'react'
import { HeaderBar } from '@/features/dashboard/components/HeaderBar'
import { useMyPatient } from '@/features/auth/hooks/useMyPatient'
import { Achievements } from '@/features/report/components/Achievements'
import { AiInsightCard } from '@/features/report/components/AiInsightCard'
import { EmptyState } from '@/features/report/components/EmptyState'
import { MetricCards } from '@/features/report/components/MetricCards'
import { ParticipationCalendar } from '@/features/report/components/ParticipationCalendar'
import { ReportHero } from '@/features/report/components/ReportHero'
import { ReportLayout } from '@/features/report/components/ReportLayout'
import { RomTrend } from '@/features/report/components/RomTrend'
import sectionStyles from '@/features/report/components/Sections.module.css'
import { TimeOfDay } from '@/features/report/components/TimeOfDay'
import { UsageHero } from '@/features/report/components/UsageHero'
import { UsageRanking } from '@/features/report/components/UsageRanking'
import { useReport, useReportAiSummary } from '@/features/report/hooks'
import { useReportPdfExport } from '@/features/report/hooks/useReportPdfExport'
import '@/features/dashboard/tokens.css'
import '@/features/report/tokens.css'

export function ReportPage() {
  const { data: patient } = useMyPatient()
  const patientName = patient?.nickname?.trim() || patient?.name?.trim() || '우리 아이'
  const { week, data } = useReport({ patientId: patient?.id, patientName })
  const hasData = data.summary.totalMinutes > 0 || data.summary.sessionCount > 0
  // AI 요약은 활동 데이터가 있을 때만 요청 — 데이터 0 인 빈 주에는 의미 없는 호출이고 비용도 아낌.
  const {
    data: aiSummary,
    isLoading: isAiLoading,
    isError: isAiError,
  } = useReportAiSummary(hasData ? patient?.id : undefined, hasData ? week.start : undefined)
  const captureRef = useRef<HTMLDivElement>(null)
  const { downloadPdf, isExporting } = useReportPdfExport({
    ref: captureRef,
    patientName,
    week,
  })

  return (
    <ReportLayout
      header={<HeaderBar />}
      content={
        <>
          <div className={sectionStyles.reportActionBar}>
            <button
              type="button"
              className={sectionStyles.reportExportBtn}
              onClick={downloadPdf}
              disabled={isExporting}
            >
              {isExporting ? '저장 중…' : 'PDF 저장'}
            </button>
          </div>
          <div ref={captureRef} className={sectionStyles.reportCapture}>
            <ReportHero data={data} />
            {hasData && (
              <AiInsightCard data={aiSummary} isLoading={isAiLoading} isError={isAiError} />
            )}
            {hasData ? (
              <>
                <MetricCards summary={data.summary} />
                <ParticipationCalendar days={data.participation} />
                <UsageHero usage={data.usage} daysElapsed={week.daysElapsed} />
                <div className={sectionStyles.cardRow}>
                  <UsageRanking usage={data.usage} />
                  <TimeOfDay buckets={data.timeBuckets} topBucketId={data.topBucketId} />
                </div>
                <RomTrend trends={data.romTrends} />
                <Achievements achievements={data.achievements} />
              </>
            ) : (
              <EmptyState />
            )}
          </div>
        </>
      }
    />
  )
}
