import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../../features/auth/context/AuthProvider'
import { supabase } from '../../lib/supabase'

export type HotelScope = {
  id: string
  code: string
  name: string
}

type HotelScopeContextValue = {
  hotel: HotelScope | null
  hotels: HotelScope[]
  loading: boolean
  isPlatformAdmin: boolean
  setHotel: (hotelId: string) => Promise<void>
  refreshHotels: () => Promise<void>
}

const HotelScopeContext = createContext<HotelScopeContextValue | undefined>(undefined)

export function HotelScopeProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const [hotels, setHotels] = useState<HotelScope[]>([])
  const [hotel, setHotelState] = useState<HotelScope | null>(null)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  async function refreshHotels() {
    if (!session?.user.id) {
      setHotels([])
      setHotelState(null)
      setIsPlatformAdmin(false)
      setLoading(false)
      return
    }

    setLoading(true)

    const adminQuery = await supabase
      .from('platform_admins')
      .select('active')
      .eq('user_id', session.user.id)
      .maybeSingle()

    const platformAdmin = !adminQuery.error && adminQuery.data?.active === true
    setIsPlatformAdmin(platformAdmin)

    let loadedHotels: HotelScope[] = []

    if (platformAdmin) {
      const hotelQuery = await supabase
        .from('hotels')
        .select('id, code, name')
        .eq('active', true)
        .order('name')

      if (!hotelQuery.error) {
        loadedHotels = (hotelQuery.data ?? []) as HotelScope[]
      }
    } else {
      const assignments = await supabase
        .from('user_hotel_roles')
        .select('hotel_id')
        .eq('user_id', session.user.id)
        .eq('active', true)

      const assignmentRows = (assignments.data ?? []) as Array<{ hotel_id: string | null }>
      const hotelIds = Array.from(
        new Set(assignmentRows.map((row) => row.hotel_id).filter((id): id is string => Boolean(id))),
      )

      if (hotelIds.length) {
        const hotelQuery = await supabase
          .from('hotels')
          .select('id, code, name')
          .in('id', hotelIds)
          .eq('active', true)
          .order('name')

        if (!hotelQuery.error) {
          loadedHotels = (hotelQuery.data ?? []) as HotelScope[]
        }
      }
    }

    setHotels(loadedHotels)

    const activeQuery = await supabase.rpc('get_active_hotel')
    const activeHotel = activeQuery.error ? null : ((activeQuery.data?.[0] ?? activeQuery.data) as HotelScope | null)

    const selected =
      activeHotel && loadedHotels.some((item) => item.id === activeHotel.id)
        ? loadedHotels.find((item) => item.id === activeHotel.id) ?? null
        : null

    if (selected) {
      setHotelState(selected)
    } else if (loadedHotels.length === 1) {
      const onlyHotel = loadedHotels[0]
      const setResult = await supabase.rpc('set_active_hotel', { target_hotel_id: onlyHotel.id })
      if (!setResult.error) setHotelState(onlyHotel)
      else setHotelState(null)
    } else {
      setHotelState(null)
    }

    setLoading(false)
  }
  useEffect(() => {
    if (authLoading) return
    void refreshHotels()
  }, [authLoading, session?.user.id])

  async function setHotel(hotelId: string) {
    const selected = hotels.find((item) => item.id === hotelId)
    if (!selected || !session?.user.id) return

    const result = await supabase.rpc('set_active_hotel', {
      target_hotel_id: selected.id,
    })

    if (result.error) return

    setHotelState(selected)
    window.dispatchEvent(new CustomEvent('arias:hotel-change', { detail: selected.id }))
  }

  const value = useMemo(
    () => ({
      hotel,
      hotels,
      loading,
      isPlatformAdmin,
      setHotel,
      refreshHotels,
    }),
    [hotel, hotels, loading, isPlatformAdmin],
  )

  if (authLoading || (session && loading)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white px-7 py-8 text-center shadow-sm">
          <img src="/assets/arias-suite-logo-v3.webp" alt="Arias Suite" className="mx-auto h-14 w-auto object-contain" />
          <p className="mt-5 text-sm text-slate-500">Cargando hotel…</p>
        </div>
      </main>
    )
  }

  if (session && !hotel && hotels.length > 1) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
        <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-7 shadow-lg">
          <div className="flex items-center gap-3">
            <img src="/assets/arias-suite-logo-v3.webp" alt="Arias Suite" className="h-12 w-auto object-contain" />
            <div>
              <h1 className="text-xl font-bold text-slate-900">Selecciona el hotel</h1>
              <p className="mt-1 text-sm text-slate-500">Este hotel será el contexto de trabajo de toda Arias Suite.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {hotels.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setHotel(item.id)}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{item.code}</div>
                <div className="mt-1 text-base font-bold text-slate-900">{item.name}</div>
                <div className="mt-3 text-xs font-semibold text-slate-500">Entrar en este hotel →</div>
              </button>
            ))}
          </div>
        </section>
      </main>
    )
  }

  if (session && hotels.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
        <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <img src="/assets/arias-suite-logo-v3.webp" alt="Arias Suite" className="mx-auto h-16 w-auto object-contain" />
          <h1 className="mt-5 text-xl font-semibold text-slate-900">Hotel no disponible</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Tu cuenta no tiene un hotel activo disponible para trabajar.</p>
        </section>
      </main>
    )
  }

  return (
    <HotelScopeContext.Provider value={value}>
      {session && hotels.length > 1 && hotel && (
        <div className="fixed left-1/2 top-2 z-[100] -translate-x-1/2">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-2.5 py-1.5 shadow-lg backdrop-blur sm:px-3">
            <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:inline">Hotel activo</span>
            <select
              value={hotel.id}
              onChange={(event) => void setHotel(event.target.value)}
              className="max-w-[58vw] border-0 bg-transparent px-1 py-0.5 text-xs font-semibold text-slate-800 outline-none sm:max-w-[320px] sm:text-sm"
              aria-label="Cambiar hotel activo"
            >
              {hotels.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {children}
    </HotelScopeContext.Provider>
  )
}

export function useHotelScope() {
  const context = useContext(HotelScopeContext)
  if (!context) throw new Error('useHotelScope debe utilizarse dentro de HotelScopeProvider')
  return context
}
