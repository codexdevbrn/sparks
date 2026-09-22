import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Elemento #root não encontrado')

const root = createRoot(container)

function BootError({ message }: { message: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <div className="w-full rounded-xl border border-red-500/30 bg-red-500/5 p-6">
        <h1 className="text-lg font-bold text-red-400">Não foi possível iniciar o app</h1>
        <p className="mt-2 text-sm whitespace-pre-wrap text-zinc-300">{message}</p>
        <p className="mt-4 text-xs text-zinc-500">Veja as instruções em README.md.</p>
      </div>
    </div>
  )
}

/**
 * O App é carregado por import dinâmico para que uma configuração inválida do
 * Firebase apareça como mensagem em tela, e não como página em branco.
 */
async function boot() {
  try {
    const { App } = await import('./App')
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  } catch (err) {
    console.error(err)
    root.render(<BootError message={err instanceof Error ? err.message : String(err)} />)
  }
}

void boot()

// Registra depois do load pra não competir com o carregamento inicial.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // PWA é bônus, não requisito — falhar aqui não pode derrubar o app.
    })
  })
}
