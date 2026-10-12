import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadSavedDesign } from './views/DesignEditor.tsx'

// החל עיצוב שמור מ-localStorage לפני רינדור ראשון
loadSavedDesign();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
