import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { GUILD_NAME } from '../lib/firebase'
import { errorMessage } from '../lib/format'
import { SwordsIcon } from '../components/icons'
import { Button, Card, ErrorNote, Spinner } from '../components/ui'

// Gravura "The Battle of Ascalon" (a partir de Gustave Doré, 1881) — domínio
// público, via Wikimedia Commons. Só de clima: uma cena de batalha medieval
// na tela de entrada, antes de logar.
const HERO_URL = 'https://upload.wikimedia.org/wikipedia/commons/0/00/Battle_of_Ascalon-engraving.jpg'

export function Login() {
  const { user, loading, signIn } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading) return <Spinner />
  if (user) return <Navigate to="/" replace />

  async function handleSignIn() {
    setBusy(true)
    setError(null)
    try {
      await signIn()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-30 grayscale-[30%]"
        style={{ backgroundImage: `url(${HERO_URL})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/85 to-zinc-950" />

      <div className="relative mx-auto flex min-h-dvh max-w-md items-center px-4">
        <Card className="w-full p-8">
          <div className="text-center">
            <SwordsIcon className="mx-auto size-8 text-amber-500" />
            <h1 className="font-display mt-3 text-2xl font-bold tracking-tight text-zinc-50">
              {GUILD_NAME}
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Painel da guild: reserva de sets, anúncios e eventos.
            </p>
          </div>

          <Button className="mt-8 w-full" onClick={() => void handleSignIn()} disabled={busy}>
            {busy ? 'Abrindo…' : 'Entrar com Google'}
          </Button>

          <div className="mt-4">
            <ErrorNote message={error} />
          </div>

          <p className="mt-6 text-center text-xs text-zinc-500">
            Novas contas entram como pendentes e precisam da aprovação de um admin.
          </p>
        </Card>
      </div>
    </div>
  )
}
