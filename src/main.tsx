import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadSavedDesign } from './views/DesignEditor.tsx'

// טעינת CSS מובייל כשרץ בתוך Capacitor (native WebView)
if (
  window.navigator.userAgent.includes('Capacitor') ||
  !!(window as unknown as Record<string, unknown>)['Capacitor']
) {
  import('./mobile.css');
}

// החל עיצוב שמור מ-localStorage לפני רינדור ראשון
loadSavedDesign();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
