import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { Button, Card, Spinner } from './ui'

/** Tela para quem está autenticado mas ainda não foi aprovado pelo admin. */
function PendingApproval() {
  const { user, logout } = useAuth()
  return (
    <div className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Card className="w-full p-6 text-center">
        <h1 className="text-lg font-bold text-zinc-50">Aguardando aprovação</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Sua conta <span className="text-zinc-200">{user?.email}</span> foi registrada. Um admin da
          guild precisa liberar seu acesso.
        </p>
        <p className="mt-4 text-xs text-zinc-500">
          Assim que for aprovado, esta tela libera automaticamente — não precisa recarregar.
        </p>
        <Button variant="secondary" className="mt-6 w-full" onClick={() => void logout()}>
          Sair
        </Button>
      </Card>
    </div>
  )
}

export function RequireAuth({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, member, loading, isMember, isAdmin } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!member) return <PendingApproval />
  if (!isMember) return <PendingApproval />

  // Sem nick não é possível identificar quem reservou o quê.
  if (!member.nick && location.pathname !== '/perfil') {
    return <Navigate to="/perfil" replace />
  }

  if (adminOnly && !isAdmin) return <Navigate to="/" replace />

  return <>{children}</>
}
