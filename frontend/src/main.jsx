import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { WagmiProviders } from './wagmi.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WagmiProviders>
      <App />
    </WagmiProviders>
  </StrictMode>,
)
