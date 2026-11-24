import { useLocation, useNavigate } from 'react-router-dom'

interface BrandLogoProps {
  src?: string
  alt?: string
  className?: string
  onActivate?: () => void
  label?: string
  behavior?: 'home' | 'refresh'
}

export default function BrandLogo({
  src = '/assets/arias-suite-logo-hotel-gold-v1.webp',
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
      className="arias-brand-logo shrink-0 rounded-lg outline-none transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-slate-400 active:translate-y-0"
    >
      <img src={src} alt={alt} className={className + ' min-h-11 sm:min-h-14'} />
    </button>
  )
}
