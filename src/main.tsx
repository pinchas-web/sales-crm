import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadSavedDesign } from './views/DesignEditor.tsx'

// דף חתימה ציבורי על הסכם — בלי התחברות ובלי ה-CRM עצמו
const SignPage = lazy(() => import('./contracts/SignPage'))
const signMatch = window.location.pathname.match(/^\/sign\/([a-f0-9]{32})\/?$/)

// החל עיצוב שמור מ-localStorage לפני רינדור ראשון
if (!signMatch) loadSavedDesign();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {signMatch
      ? <Suspense fallback={null}><SignPage token={signMatch[1]} /></Suspense>
      : <App />}
  </StrictMode>,
)
