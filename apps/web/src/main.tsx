import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { BackofficeAuthProvider } from './lib/auth'
import { readRuntimeConfig } from './lib/config'

const runtime = readRuntimeConfig()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {'error' in runtime ? (
      <main className="configuration-error" role="alert">
        <p>ViStay Backoffice</p>
        <h1>Ứng dụng chưa được cấu hình.</h1>
        <code>{runtime.error}</code>
        <span>Đối chiếu tệp <strong>apps/web/.env.example</strong> rồi khởi động lại ứng dụng.</span>
      </main>
    ) : (
      <BackofficeAuthProvider config={runtime.config}>
        <App config={runtime.config} />
      </BackofficeAuthProvider>
    )}
  </StrictMode>,
)
