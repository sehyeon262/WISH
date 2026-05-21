import html2canvas from 'html2canvas-pro'
import jsPDF from 'jspdf'

type ExportOptions = {
  filename: string
  marginMm?: number
}

export async function exportElementToPdf(
  element: HTMLElement,
  { filename, marginMm = 8 }: ExportOptions,
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  })

  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  const contentWidth = pageWidth - marginMm * 2
  const imgHeight = (canvas.height * contentWidth) / canvas.width
  const pageContentHeight = pageHeight - marginMm * 2

  const pagesNeeded = Math.max(1, Math.ceil(imgHeight / pageContentHeight))

  for (let i = 0; i < pagesNeeded; i++) {
    if (i > 0) pdf.addPage()
    const yOffset = marginMm - i * pageContentHeight
    pdf.addImage(imgData, 'PNG', marginMm, yOffset, contentWidth, imgHeight)
  }

  pdf.save(filename)
}
