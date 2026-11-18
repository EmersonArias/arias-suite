import type { CSSProperties, ReactNode } from 'react'

interface GridViewportProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

export default function GridViewport({
  children,
  className = '',
  style,
}: GridViewportProps) {
  return (
    <div
      className={'arias-grid-viewport min-h-[300px] max-h-[calc(100vh-360px)] overflow-x-auto overflow-y-scroll ' + className}
      style={{
        scrollbarGutter: 'stable',
        scrollbarWidth: 'auto',
        scrollbarColor: '#94a3b8 #f1f5f9',
        ...style,
      }}
    >
      {children}
    </div>
  )
}