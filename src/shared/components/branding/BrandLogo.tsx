import { useLocation, useNavigate } from 'react-router-dom'

interface BrandLogoProps {
  alt?: string
  className?: string
  onActivate?: () => void
  label?: string
  behavior?: 'home' | 'refresh'
}

export default function BrandLogo({
  alt = 'Arias Suite',
  className = 'h-11 w-auto object-contain',
  onActivate,
  label,
  behavior = 'home',
}: BrandLogoProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const activate = onActivate ?? (() => {
    if (behavior === 'refresh' || location.pathname === '/') {
      window.location.reload()
      return
    }

    navigate('/')
  })

  const accessibleLabel =
    label ??
    (behavior === 'refresh' || location.pathname === '/'
      ? 'Actualizar Arias Suite'
      : 'Ir a la pantalla principal')

  return (
    <button
      type="button"
      onClick={activate}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      className="shrink-0 rounded-lg outline-none transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-slate-400 active:translate-y-0"
    >
      <img src="/assets/arias-suite-logo-v2.webp" alt={alt} className={className} />
    </button>
  )
}
