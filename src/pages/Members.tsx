import { useEffect, useMemo, useState } from 'react'
import { onValue, ref, serverTimestamp, update } from 'firebase/database'
import { useAuth } from '../lib/auth'
import { db } from '../lib/firebase'
import { errorMessage } from '../lib/format'
import { listFrom } from '../lib/rtdb'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Select,
  Spinner,
} from '../components/ui'
import { ROLE_LABELS } from '../types'
import type { Member, Reservation, Role } from '../types'

const ROLE_TONE: Record<Role, 'amber' | 'green' | 'neutral'> = {
  admin: 'amber',
  member: 'green',
  pending: 'neutral',
}

export function Members() {
  const { member: me, isAdmin } = useAuth()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [inviteCopied, setInviteCopied] = useState(false)

  useEffect(() => {
    const unsubMembers = onValue(
      ref(db, 'members'),
      (snap) => setMembers(listFrom<Member>(snap.val(), 'uid')),
      (err) => setError(errorMessage(err)),
    )

    // Necessário para liberar as reservas de quem é removido da guild.
    const unsubRes = onValue(
      ref(db, 'reservations'),
      (snap) => setReservations(listFrom<Reservation>(snap.val())),
      () => setReservations([]),
    )

    return () => {
      unsubMembers()
      unsubRes()
    }
  }, [])

  const { pending, active } = useMemo(() => {
    const all = members ?? []
    const byName = (a: Member, b: Member) =>
      (a.nick || a.email || '').localeCompare(b.nick || b.email || '')
    return {
      pending: all.filter((m) => m.role === 'pending').sort(byName),
      active: all
        .filter((m) => m.role !== 'pending')
        .sort((a, b) => (a.role === b.role ? byName(a, b) : a.role === 'admin' ? -1 : 1)),
    }
  }, [members])

  async function setRole(target: Member, role: Role) {
    setBusy(target.uid)
    setError(null)
    try {
      await update(ref(db, `members/${target.uid}`), { role, updatedAt: serverTimestamp() })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  /**
   * Remover o membro libera as reservas dele, para não sobrarem peças presas a
   * quem saiu. Escrita multi-path: tudo ou nada.
   */
  async function remove(target: Member) {
    if (!confirm(`Remover ${target.nick || target.email} da guild e liberar as reservas dele?`)) return
    setBusy(target.uid)
    setError(null)
    try {
      const updates: Record<string, null> = { [`members/${target.uid}`]: null }
      for (const res of reservations) {
        if (res.uid === target.uid) updates[`reservations/${res.id}`] = null
      }
      await update(ref(db), updates)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(window.location.origin)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    } catch {
      // Sem permissão de clipboard — sem crise, o link já está na barra de endereço.
    }
  }

  if (members === null) return <Spinner />

  return (
    <>
      <PageHeader
        title="Membros"
        description={`${active.length} na guild.`}
        action={
          isAdmin && (
            <Button variant="secondary" size="sm" onClick={() => void copyInvite()}>
              {inviteCopied ? 'Copiado!' : 'Copiar link de convite'}
            </Button>
          )
        }
      />
      <ErrorNote message={error} />

      {isAdmin && pending.length > 0 && (
        <Card className="mb-6 border-amber-500/30 p-5">
          <h2 className="mb-3 text-sm font-semibold text-amber-400">
            Aguardando aprovação ({pending.length})
          </h2>
          <ul className="divide-y divide-zinc-800">
            {pending.map((m) => (
              <li key={m.uid} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-200">{m.displayName || 'Sem nome'}</p>
                  <p className="truncate text-xs text-zinc-500">{m.email}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy === m.uid} onClick={() => void setRole(m, 'member')}>
                    Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy === m.uid}
                    onClick={() => void remove(m)}
                  >
                    Recusar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {active.length === 0 ? (
        <EmptyState title="Nenhum membro aprovado ainda" />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-zinc-800">
            {active.map((m) => (
              <li key={m.uid} className="flex flex-wrap items-center gap-3 px-5 py-3">
                {m.photoURL ? (
                  <img src={m.photoURL} alt="" className="size-9 shrink-0 rounded-full" />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-800 text-xs">
                    {(m.nick || '?').slice(0, 2).toUpperCase()}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-100">
                    {m.nick || m.displayName || 'Sem nick'}
                    {m.uid === me?.uid && <span className="ml-2 text-xs text-zinc-500">(você)</span>}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {m.charClass || 'classe não definida'}
                  </p>
                </div>

                {isAdmin ? (
                  <div className="flex items-center gap-2">
                    <Select
                      className="w-auto py-1 text-xs"
                      value={m.role}
                      disabled={busy === m.uid || m.uid === me?.uid}
                      onChange={(e) => void setRole(m, e.target.value as Role)}
                    >
                      <option value="member">Membro</option>
                      <option value="admin">Admin</option>
                    </Select>
                    {m.uid !== me?.uid && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === m.uid}
                        onClick={() => void remove(m)}
                      >
                        Remover
                      </Button>
                    )}
                  </div>
                ) : (
                  <Badge tone={ROLE_TONE[m.role]}>{ROLE_LABELS[m.role]}</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
