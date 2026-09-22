import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { GUILD_NAME } from '../lib/firebase'
import { errorMessage } from '../lib/format'
import { Button, Card, ErrorNote, Spinner } from '../components/ui'

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
    <div className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Card className="w-full p-8">
        <div className="text-center">
          <span className="text-3xl text-amber-500">⚔</span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-50">{GUILD_NAME}</h1>
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
  )
}
