import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './features/auth/context/AuthProvider'
import RoutedApplication from './shared/navigation/RoutedApplication'
import './index.css'


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <RoutedApplication />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
