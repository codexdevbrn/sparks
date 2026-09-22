import { useEffect, useState } from 'react'
import { Button } from './ui'

/** Evento não-padrão do Chrome/Edge/Android; TS não conhece o tipo. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS Safari não tem `display-mode`, tem essa propriedade própria.
  return Boolean((window.navigator as { standalone?: boolean }).standalone)
}

/**
 * Rodapé com o "link pra baixar" o app. PWA não é um arquivo pra baixar — é
 * instalado pelo próprio navegador — então isso é um botão que dispara o
 * prompt nativo (`beforeinstallprompt`, Chrome/Edge/Android) ou, onde esse
 * evento não existe (iOS Safari é o caso comum), uma instrução de como
 * instalar manualmente.
 */
export function InstallPwaFooter() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => isStandalone())

  useEffect(() => {
    function onBeforeInstall(event: Event) {
      event.preventDefault()
      setPrompt(event as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setInstalled(true)
      setPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (!prompt) return
    await prompt.prompt()
    await prompt.userChoice
    setPrompt(null)
  }

  if (installed) return null

  return (
    <footer className="mx-auto max-w-6xl px-4 pb-8 text-center">
      {prompt ? (
        <Button variant="secondary" size="sm" onClick={() => void install()}>
          ⬇ Instalar app
        </Button>
      ) : (
        <p className="text-xs text-zinc-600">
          Instale como app: no menu do navegador, use "Instalar app" ou "Adicionar à tela de
          início".
        </p>
      )}
    </footer>
  )
}
