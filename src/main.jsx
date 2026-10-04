import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ThemeProvider } from './lib/theme'
import { AuthProvider } from './lib/auth'
import { ToastProvider } from './components/ui'
import { configured } from './lib/supabase'
import SetupNeeded from './pages/SetupNeeded'
import './index.css'

createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    {configured ? (
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    ) : (
      <SetupNeeded />
    )}
  </ThemeProvider>,
)
