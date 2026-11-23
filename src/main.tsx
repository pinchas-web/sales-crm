import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadSavedDesign } from './views/DesignEditor.tsx'

// דף חתימה ציבורי על הסכם — בלי התחברות ובלי ה-CRM עצמו
const SignPage = lazy(() => import('./contracts/SignPage'))
const signMatch = window.location.pathname.match(/^\/sign\/([a-f0-9]{32})\/?$/)
// שאלון ללקוח — קישור אישי (/q/<token>) או כללי (/q/strategy, /q/mental)
const QuestionnairePage = lazy(() => import('./questionnaires/QuestionnairePage'))
const qMatch = window.location.pathname.match(/^\/q\/([a-f0-9]{32}|strategy|mental)\/?$/)
const qMode = qMatch ? (/^[a-f0-9]{32}$/.test(qMatch[1]) ? { token: qMatch[1] } : { qid: qMatch[1] as 'strategy' | 'mental' }) : null

// החל עיצוב שמור מ-localStorage לפני רינדור ראשון
if (!signMatch && !qMode) loadSavedDesign();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {signMatch
      ? <Suspense fallback={null}><SignPage token={signMatch[1]} /></Suspense>
      : qMode
        ? <Suspense fallback={null}><QuestionnairePage mode={qMode} /></Suspense>
        : <App />}
  </StrictMode>,
)
