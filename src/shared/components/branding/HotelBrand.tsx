import type { HotelScope } from '../../context/HotelScopeContext'

type Props = {
  hotel: HotelScope | null
  hotels: HotelScope[]
  canSwitch: boolean
  onChange: (id: string) => Promise<void>
}

// Original vector from the hotel's official website:
// https://www.sb-hotels.com/hoteles/barcelona/diagonal-zero/
// Logo: static-resources-elementor.mirai.com/wp-content/uploads/sites/1193/sb_diagonal_zero.svg
export default function HotelBrand({ hotel, hotels, canSwitch, onChange }: Props) {
  const diagonalZero = /\bdiagonal[\s_-]*(?:zero|cero)\b/i.test(hotel?.name ?? '')
  return <div className="arias-hotel-brand relative flex shrink-0 items-center justify-center rounded-2xl px-4 text-center text-white shadow-sm" style={{ backgroundColor: '#4f3264' }}>
    {diagonalZero ? <img src="/assets/hotel-logos/sb-diagonal-zero.svg" alt={hotel?.name ?? 'Hotel SB Diagonal Zero'} className="max-h-full w-full object-contain brightness-0 invert" />
      : <span className="text-sm font-semibold leading-snug">{hotel?.name ?? 'Selecciona un hotel'}</span>}
    {canSwitch && hotels.length > 1 && <select value={hotel?.id ?? ''} onChange={event => void onChange(event.target.value)}
      aria-label="Cambiar hotel" title="Cambiar hotel" className="absolute inset-0 h-full w-full cursor-pointer rounded-2xl opacity-0 focus:opacity-100 focus:bg-[#4f3264] focus:px-3 focus:text-white focus:outline-2 focus:outline-offset-2 focus:outline-violet-300">
      {hotels.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>}
  </div>
}
