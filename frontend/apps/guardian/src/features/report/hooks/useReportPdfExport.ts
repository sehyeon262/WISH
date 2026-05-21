import { useCallback, useState, type RefObject } from 'react'
import type { WeekRange } from '../data/types'
import { exportElementToPdf } from '../utils/exportPdf'

type Options = {
  ref: RefObject<HTMLElement | null>
  patientName: string
  week: WeekRange
}

function safeFileFragment(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '').trim() || '리포트'
}

export function useReportPdfExport({ ref, patientName, week }: Options) {
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const downloadPdf = useCallback(async () => {
    if (!ref.current || isExporting) return
    setIsExporting(true)
    setError(null)
    try {
      const filename = `코몽_주간리포트_${safeFileFragment(patientName)}_${week.start}.pdf`
      await exportElementToPdf(ref.current, { filename })
    } catch (e) {
      setError(e instanceof Error ? e : new Error('PDF 저장 실패'))
    } finally {
      setIsExporting(false)
    }
  }, [ref, isExporting, patientName, week.start])

  return { downloadPdf, isExporting, error }
}
