import { useEffect, useState } from 'react'
import { hotelDay } from './preventiveSchedule'

export function useHotelDay() {
  const [day, setDay] = useState(() => hotelDay())
  useEffect(() => {
    const refresh = () => setDay(hotelDay())
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])
  return day
}
