import { useLocation, useNavigate } from 'react-router-dom'

interface BrandLogoProps {
  alt?: string
  className?: string
  onActivate?: () => void
  label?: string
  behavior?: 'home' | 'refresh'
  showTagline?: boolean
}

export default function BrandLogo({
  alt = 'Arias Suite',
  className = 'h-11 w-auto object-contain',
  onActivate,
  label,
  behavior = 'home',
  showTagline = false,
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
      <img src="/assets/arias-suite-logo-v4.webp" alt={alt} className={className + ' min-h-11 sm:min-h-14'}
        style={showTagline ? { clipPath: 'polygon(0 0, 100% 0, 100% 90%, 49% 90%, 49% 100%, 0 100%)' } : undefined} />
      {showTagline && <span className="mt-1 block text-center text-xs font-semibold tracking-[0.12em] text-slate-700 sm:text-sm">Mantenimiento hotelero</span>}
    </button>
  )
}
