import { useMemo, useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { qrcode } from '../../lib/qrcode-generator'
import ActionButton from '../buttons/ActionButton'

interface AssetQrCodeProps {
  value: string
  label: string
}

interface QrCodeInstance {
  addData: (data: string, mode?: string) => void
  make: () => void
  createSvgTag: (options: {
    cellSize?: number
    margin?: number
    scalable?: boolean
  }) => string
}

const createQrCode = qrcode as unknown as (
  typeNumber: number,
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H',
) => QrCodeInstance

async function svgToPngBlob(svg: string): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  try {
    const image = new Image()
    image.decoding = 'async'

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('No se pudo preparar el QR.'))
      image.src = url
    })

    const size = 1000
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size

    const context = canvas.getContext('2d')
    if (!context) throw new Error('No se pudo preparar la imagen del QR.')

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, size, size)
    context.drawImage(image, 0, 0, size, size)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('No se pudo crear el PNG del QR.'))
      }, 'image/png')
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function AssetQrCode({ value, label }: AssetQrCodeProps) {
  const [copied, setCopied] = useState(false)

  const svg = useMemo(() => {
    const qr = createQrCode(0, 'M')
    qr.addData(value, 'Byte')
    qr.make()

    return qr.createSvgTag({
      cellSize: 5,
      margin: 4,
      scalable: false,
    })
  }, [value])

  async function copyQr() {
    try {
      const blob = await svgToPngBlob(svg)

      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ])
      } else {
        downloadBlob(blob, 'QR-' + (label || 'activo') + '.png')
      }

      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      try {
        const blob = await svgToPngBlob(svg)
        downloadBlob(blob, 'QR-' + (label || 'activo') + '.png')
      } catch {
        setCopied(false)
      }
    }
  }

  async function downloadQr() {
    const blob = await svgToPngBlob(svg)
    downloadBlob(blob, 'QR-' + (label || 'activo') + '.png')
  }

  function downloadSvg() {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    downloadBlob(blob, 'QR-' + (label || 'activo') + '.svg')
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
        <div
          className="shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 [&>svg]:block [&>svg]:h-40 [&>svg]:w-40"
          aria-label={'Código QR de ' + label}
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-slate-800">Código QR</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Escanea el código para abrir directamente la ficha de este activo.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton
              icon={copied ? Check : Copy}
              label={copied ? 'Copiado' : 'Copiar QR'}
              onClick={() => void copyQr()}
              tone="primary"
            />
            <ActionButton
              icon={Download}
              label="Descargar PNG"
              onClick={() => void downloadQr()}
            />
            <ActionButton
              icon={Download}
              label="Descargar SVG"
              onClick={downloadSvg}
            />
          </div>

          <div className="mt-2 text-[10px] leading-4 text-slate-400">
            Para Word: pulsa <strong>Copiar QR</strong> y luego Ctrl+V.
          </div>

          <div className="mt-2 break-all rounded-lg bg-slate-50 p-2 text-[10px] leading-4 text-slate-500">
            {value}
          </div>
        </div>
      </div>
    </div>
  )
}
