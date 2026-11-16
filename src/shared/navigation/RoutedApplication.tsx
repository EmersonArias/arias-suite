import { useLocation } from 'react-router-dom'
import App from '../../App'
import { SystemDialogProvider } from '../components/dialogs/SystemDialogProvider'
import { HotelScopeProvider } from '../context/HotelScopeContext'
import ReadOnlyDemoGuard from '../components/ReadOnlyDemoGuard'

export default function RoutedApplication() {
  const { pathname } = useLocation()
  if (['/mi-horario','/login','/activate','/forgot-password','/update-password'].includes(pathname)) {
    return <SystemDialogProvider><ReadOnlyDemoGuard><App /></ReadOnlyDemoGuard></SystemDialogProvider>
  }
  return <HotelScopeProvider><SystemDialogProvider><ReadOnlyDemoGuard><App /></ReadOnlyDemoGuard></SystemDialogProvider></HotelScopeProvider>
}

