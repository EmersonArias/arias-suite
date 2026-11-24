import type { ReactNode } from 'react'

type Props={
 selected:boolean
 onClick:()=>void
 children:ReactNode
 disabled?:boolean
 title?:string
 className?:string
}
export default function StaffToggleButton({selected,onClick,children,disabled=false,title,className=''}:Props){
 return <button type="button" aria-pressed={selected} title={title}
   disabled={disabled} onClick={onClick}
   className={'inline-flex min-h-8 items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-40 '+
   (selected?'border-slate-900 bg-slate-900 text-white':'border-slate-300 bg-white text-slate-700 hover:bg-slate-100')+' '+className}>
   {children}
 </button>
}
