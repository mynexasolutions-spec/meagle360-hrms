import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Surface every error with full detail in the console — including ones
// thrown outside our own promise chains (e.g. by the browser's storage
// layer) — so they're not silently swallowed as generic "Script error."
window.addEventListener('error', (event) => {
  console.error('[GLOBAL ERROR]', event.message, '\nsource:', event.filename, event.lineno, event.colno, '\nerror object:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[UNHANDLED PROMISE REJECTION]', event.reason);
  if (event.reason?.stack) {
    console.error('[UNHANDLED PROMISE REJECTION] stack:', event.reason.stack);
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
