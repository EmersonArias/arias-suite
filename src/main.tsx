import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, useLocation } from 'react-router-dom'
import App from './App'
import { SystemDialogProvider } from './shared/components/dialogs/SystemDialogProvider'
import { HotelScopeProvider } from './shared/context/HotelScopeContext'
import { AuthProvider } from './features/auth/context/AuthProvider'
import './index.css'

function RoutedApplication() {
  const { pathname } = useLocation()
  if (pathname === '/mi-horario') {
    return <SystemDialogProvider><App /></SystemDialogProvider>
  }
  return <HotelScopeProvider><SystemDialogProvider><App /></SystemDialogProvider></HotelScopeProvider>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <RoutedApplication />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)