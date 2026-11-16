import { CornerUpLeft, House } from 'lucide-react'
import FullscreenButton from './FullscreenButton'
import IconButton from '../buttons/IconButton'
import ActionButton from '../buttons/ActionButton'

interface NavigationButtonsProps {
  onBack: () => void
  onHome: () => void
  disabled?: boolean
}

export function BackButton({
  onBack,
  disabled = false,
}: Pick<NavigationButtonsProps, 'onBack' | 'disabled'>) {
  return (
    <ActionButton
      icon={CornerUpLeft}
      label="Volver"
      onClick={onBack}
      disabled={disabled}
    />
  )
}

export function HomeButton({
  onHome,
  disabled = false,
  className,
}: Pick<NavigationButtonsProps, 'onHome' | 'disabled'> & { className?: string }) {
  return <span className="inline-flex shrink-0 items-start gap-2"><FullscreenButton /><IconButton icon={House} label="Inicio" title="Inicio" onClick={onHome} disabled={disabled} className={className} /></span>
}

export default function NavigationButtons({
  onBack,
  onHome,
  disabled = false,
}: NavigationButtonsProps) {
  return (
    <div className="arias-mobile-header-actions flex items-center gap-2">
      <BackButton onBack={onBack} disabled={disabled} />
      <HomeButton onHome={onHome} disabled={disabled} />
    </div>
  )
}
