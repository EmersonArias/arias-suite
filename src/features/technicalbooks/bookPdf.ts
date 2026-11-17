import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { answerText, entryFields, frequencyLabels } from './bookModel.ts'
import type { BookDefinition, BookEntry } from './types.ts'

const printable = (value: string) => value.replaceAll('√', 'Comprobación').replaceAll('ᵒ', '°')

export function buildBookPdf(book: BookDefinition, entries: BookEntry[], hotel: string, demo = true) {
  if (!entries.length) throw new Error('No hay registros para exportar.')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  entries.forEach((entry, index) => {
    // Keep the control labels and source version recorded with each inspection.
    const template = entry.template
    if (index) pdf.addPage()
    autoTable(pdf, {
      startY: 30, margin: { top: 30, bottom: 22, left: 14, right: 14 }, theme: 'plain',
      styles: { fontSize: 9, overflow: 'linebreak', cellPadding: 2 },
      body: [
        ['Hotel', hotel, 'Estado', entry.status === 'FINAL' ? 'Finalizado' : 'Borrador'],
        [book.assetLabel, entry.asset, 'Fecha / hora', `${entry.date} ${entry.time}`],
        ['Ubicación', entry.location || 'Sin indicar', 'Técnico', entry.technician],
        ['Campaña / revisión', entry.campaign || 'Sin indicar', 'Controles', frequencyLabels[entry.frequency] ?? entry.frequency],
        ['Versión', `Rev. ${entry.revision} · ${entry.id}`, 'Rectifica a', entry.supersedes || 'Primera revisión'],
        ['Motivo rectificación', entry.correctionReason || 'No procede', 'Finalización', entry.finalizedAt || 'Sin finalizar'],
      ],
    })
    let y = (pdf as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5
    autoTable(pdf, {
      startY: y, margin: { top: 30, bottom: 22, left: 14, right: 14 }, theme: 'grid', rowPageBreak: 'avoid',
      head: [['Control', 'Resultado / medición', 'Detalle']],
      body: entryFields(template, entry).map(field => {
        const answer = entry.answers[field.id]
        return [`${field.label}${field.frequency ? ' [' + field.frequency + ']' : ''}${field.reference ? '\nValor de referencia: ' + printable(field.reference) : ''}`,
          answerText(field, { ...entry, answers: { ...entry.answers, [field.id]: { value: answer?.value ?? '', note: '' } } }), answer?.note || '']
      }),
      styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: [15, 80, 115] }, columnStyles: { 0: { cellWidth: 76 }, 1: { cellWidth: 40 }, 2: { cellWidth: 66 } },
    })
    y = (pdf as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5
    autoTable(pdf, {
      startY: y, margin: { top: 30, bottom: 22, left: 14, right: 14 }, theme: 'plain', styles: { fontSize: 8, overflow: 'linebreak' },
      body: [['Observaciones', entry.observations || 'Sin observaciones']],
    })
    y = (pdf as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
    for (const photo of entry.evidence) {
      const caption = pdf.splitTextToSize(photo.name.slice(0, 140), 175)
      const captionHeight = caption.length * 4
      if (y + captionHeight + 58 > 272) { pdf.addPage(); y = 32 }
      const props = pdf.getImageProperties(photo.dataUrl)
      const scale = Math.min(100 / props.width, 52 / props.height)
      pdf.setFontSize(8)
      pdf.text(caption, 14, y)
      pdf.addImage(photo.dataUrl, props.fileType, 14, y + captionHeight + 1, props.width * scale, props.height * scale)
      y += captionHeight + 60
    }
  })
  const total = pdf.getNumberOfPages()
  for (let page = 1; page <= total; page++) {
    pdf.setPage(page)
    pdf.setTextColor(15, 80, 115); pdf.setFontSize(12)
    pdf.text(`${book.code} · ${book.title}`, 14, 15, { maxWidth: 181 })
    pdf.setTextColor(146, 64, 14); pdf.setFontSize(8)
    pdf.text(demo ? 'DOCUMENTO DE PRUEBA · SIN VALIDEZ COMO REGISTRO REAL' : 'REGISTRO TÉCNICO · HISTORIAL DEL HOTEL', 14, 23)
    pdf.setTextColor(90); pdf.setFontSize(8)
    pdf.text(`Arias Suite · ${page} / ${total} · ${demo ? 'Documento de prueba' : 'Registro conservado en Arias Suite'}`, 14, 286)
  }
  return pdf
}
