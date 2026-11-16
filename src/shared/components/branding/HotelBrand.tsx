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
  return <div className="arias-hotel-brand relative flex shrink-0 items-center justify-center text-center text-blue-700">
    {diagonalZero ? <img src="/assets/hotel-logos/sb-diagonal-zero-blue.svg" alt={hotel?.name ?? 'Hotel SB Diagonal Zero'} className="max-h-full w-full object-contain" />
      : <span className="text-sm font-semibold leading-snug">{hotel?.name ?? 'Selecciona un hotel'}</span>}
    {canSwitch && hotels.length > 1 && <select value={hotel?.id ?? ''} onChange={event => void onChange(event.target.value)}
      aria-label="Cambiar hotel" title="Cambiar hotel" className="absolute inset-0 h-full w-full cursor-pointer rounded-2xl opacity-0 focus:opacity-100 focus:bg-slate-50 focus:px-3 focus:text-blue-700 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500">
      {hotels.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>}
  </div>
}
