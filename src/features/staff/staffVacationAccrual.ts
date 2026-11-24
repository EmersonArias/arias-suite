/** Devengo informativo de días naturales. No modifica saldos aprobados. */
export function accruedVacationDays(
  annualDays:number, year:number, asOf:string, joinDate:string|null
):number|null {
  if (!joinDate || !/^\d{4}-\d{2}-\d{2}$/.test(joinDate)) return null
  const yStart=Date.UTC(year,0,1)
  const yEnd=Date.UTC(year+1,0,1)
  const cut=Date.parse(asOf+'T00:00:00Z')
  const join=Date.parse(joinDate+'T00:00:00Z')
  if(![cut,join].every(Number.isFinite))return null
  const first=Math.max(join,yStart)
  const last=Math.min(cut,yEnd-86400000)
  if(last<first)return 0
  const totalDays=Math.round((yEnd-yStart)/86400000)
  const accruedDays=Math.round((last-first)/86400000)+1
  return Math.round(100*annualDays*accruedDays/totalDays)/100
}
