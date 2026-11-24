import type { jsPDF } from 'jspdf'

export function previewPdf(doc: jsPDF, filename: string): void {
  const url = URL.createObjectURL(doc.output('blob'))
  const dialog = document.createElement('dialog')
  dialog.setAttribute('aria-label', 'Vista previa del PDF')
  dialog.style.cssText = 'width:min(96vw,1100px);height:92dvh;max-width:none;max-height:none;padding:0;border:1px solid #cbd5e1;border-radius:12px;background:white;color:#172033;margin:auto;'
  const layout = document.createElement('div')
  layout.style.cssText = 'display:flex;flex-direction:column;height:100%;'
  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;font-weight:600;'
  header.textContent = 'Vista previa del PDF'
  const close = document.createElement('button')
  close.type = 'button'; close.textContent = 'Cerrar'; close.style.cssText = 'padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;'
  close.onclick = () => dialog.close()
  header.append(close)
  const frame = document.createElement('iframe')
  frame.title = 'Documento PDF'
  frame.src = url + '#toolbar=0&navpanes=0'
  frame.style.cssText = 'width:100%;flex:1;min-height:0;border:0;background:#e2e8f0;'
  const footer = document.createElement('div')
  footer.style.cssText = 'display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:12px;padding:12px 16px;'
  const open = document.createElement('a')
  open.href = url; open.target = '_blank'; open.rel = 'noopener noreferrer'; open.textContent = 'Abrir vista previa en otra pestaña'
  const generate = document.createElement('button')
  generate.type = 'button'; generate.textContent = 'Generar PDF'
  generate.style.cssText = 'background:#173e59;color:white;padding:10px 16px;border-radius:6px;font-weight:600;'
  generate.onclick = () => doc.save(filename)
  footer.append(open, generate)
  layout.append(header, frame, footer); dialog.append(layout)
  dialog.addEventListener('close', () => { dialog.remove(); URL.revokeObjectURL(url) }, { once: true })
  document.body.append(dialog)
  try { dialog.showModal() } catch (error) { dialog.remove(); URL.revokeObjectURL(url); throw error }
}
