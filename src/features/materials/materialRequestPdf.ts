import { loadPdfLibraries } from '../../shared/components/reports/loadPdfLibraries'

export type MaterialPdfRequest = {
  request_number: string; department: string; cause: string; requester_name: string
  confirmed_at: string; notes: string | null
}
export type MaterialPdfLine = {
  quantity: number; unit_of_measure: string; description: string
  order_code: string | null; reference_code: string | null
  provider_name: string | null; purchase_url: string | null
}

export async function buildMaterialRequestPdf(request: MaterialPdfRequest, lines: MaterialPdfLine[], hotelName: string) { 
  const { jsPDF, autoTable } = await loadPdfLibraries()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()
  const bottom = doc.internal.pageSize.getHeight() - 27
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(100, 100, 100)
  doc.text('sbhotels', 14, 15)
  doc.setFontSize(16); doc.setTextColor(25, 35, 45)
  doc.text('FORMULARIO PETICIÓN MATERIAL', 14, 27)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(45, 55, 65)
  let y = 38
  const writeLines = (text: string) => {
    const wrapped = doc.splitTextToSize(text, width - 28) as string[]
    for (const line of wrapped) {
      if (y > bottom) { doc.addPage(); y = 20 }
      doc.text(line, 14, y); y += 5
    }
  }
  const date = new Date(request.confirmed_at + (request.confirmed_at.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('es-ES')
  for (const [label, value] of [
    ['Número', request.request_number], ['Establecimiento', hotelName], ['Departamento', request.department],
    ['Causa de la petición', request.cause], ['Persona solicitante', request.requester_name], ['Fecha de solicitud', date],
  ]) { writeLines(label + ': ' + value); y += 1 }
  if (y + 25 > bottom) { doc.addPage(); y = 20 }
  autoTable(doc, {
    startY: y + 3,
    head: [['UNIDADES', 'DESCRIPCIÓN', 'CÓDIGO', 'PROVEEDOR', 'ENLACE']],
    body: lines.map(line => [
      new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(line.quantity) + ' ' + line.unit_of_measure,
      line.description, line.order_code || line.reference_code || '—', line.provider_name || '—', line.purchase_url ? ' ' : '—',
    ]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.2, overflow: 'linebreak', textColor: [45, 55, 65] },
    headStyles: { fillColor: [238, 241, 244], textColor: [35, 45, 55], fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { cellWidth: 20, halign: 'center' }, 1: { cellWidth: 78 }, 2: { cellWidth: 24 }, 3: { cellWidth: 38 }, 4: { cellWidth: 'auto' } },
    margin: { left: 14, right: 14, top: 20, bottom: 27 },
    didDrawCell: data => {
      if (data.section !== 'body' || data.column.index !== 4) return
      const url = lines[data.row.index]?.purchase_url
      if (!url || !/^https?:\/\//i.test(url)) return
      doc.setTextColor(30, 90, 170)
      doc.text('Abrir enlace', data.cell.x + 2, data.cell.y + data.cell.height / 2 + 1)
      doc.link(data.cell.x + 2, data.cell.y + 1, Math.max(12, data.cell.width - 4), Math.max(4, data.cell.height - 2), { url })
    },
  })
  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 10
  if (request.notes) {
    if (y + 10 > bottom) { doc.addPage(); y = 20 }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(45, 55, 65)
    doc.text('Observaciones:', 14, y); y += 5
    doc.setFont('helvetica', 'normal')
    writeLines(request.notes)
  }
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    const footerY = doc.internal.pageSize.getHeight() - 12
    doc.setDrawColor(210, 215, 220); doc.line(14, footerY - 5, width - 14, footerY - 5)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 130, 140)
    doc.text('Arias Suite · ' + request.request_number, 14, footerY)
    doc.text('Pág. ' + page + '/' + pages, width - 14, footerY, { align: 'right' })
  }
  return doc
}
