import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Support Mermaid Interactivity
(window as any).handleClassClick = () => {
  console.log('[Dashboard] Mermaid Class Clicked');
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// @ts-ignore
window.ipcRenderer.on('main-process-message', (_event, message) => {
  console.log(message)
})
