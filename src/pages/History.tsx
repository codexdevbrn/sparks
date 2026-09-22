import { useEffect, useMemo, useState } from 'react'
import { onValue, ref, remove } from 'firebase/database'
import { useAuth } from '../lib/auth'
import { db } from '../lib/firebase'
import { errorMessage, formatDateTime } from '../lib/format'
import { listFrom } from '../lib/rtdb'
import {
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  cx,
} from '../components/ui'
import { SLOT_LABELS } from '../types'
import type { Drop } from '../types'

/**
 * Histórico de entregas, visível para toda a guild.
 *
 * A fila diz quem tem prioridade; esta tela diz quem recebeu. Ter as duas à
 * vista é o que permite discutir a ordem com base em fato, e não em memória.
 */
export function History() {
  const { member, isAdmin } = useAuth()
  const [drops, setDrops] = useState<Drop[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [who, setWho] = useState<'todos' | 'eu'>('todos')

  useEffect(() => {
    return onValue(
      ref(db, 'drops'),
      (snap) => {
        const list = listFrom<Drop>(snap.val())
        list.sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
        setDrops(list)
        setError(null)
      },
      (err) => {
        setError(errorMessage(err))
        setDrops([])
      },
    )
  }, [])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (drops ?? []).filter((drop) => {
      if (who === 'eu' && drop.uid !== member?.uid) return false
      if (!term) return true
      return (
        drop.nick.toLowerCase().includes(term) || drop.setName.toLowerCase().includes(term)
      )
    })
  }, [drops, search, who, member])

  /** Ranking de quem mais recebeu — o dado que embasa a ordem das filas. */
  const ranking = useMemo(() => {
    const byUid = new Map<string, { nick: string; count: number }>()
    for (const drop of drops ?? []) {
      const current = byUid.get(drop.uid) ?? { nick: drop.nick, count: 0 }
      current.count += 1
      current.nick = drop.nick
      byUid.set(drop.uid, current)
    }
    return [...byUid.entries()]
      .map(([uid, v]) => ({ uid, ...v }))
      .sort((a, b) => b.count - a.count || a.nick.localeCompare(b.nick))
  }, [drops])

  async function undo(drop: Drop) {
    if (!confirm(`Apagar o registro de ${drop.nick} · ${drop.setName}?`)) return
    setBusy(drop.id)
    setError(null)
    try {
      await remove(ref(db, `drops/${drop.id}`))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (drops === null) return <Spinner />

  return (
    <>
      <PageHeader
        title="Histórico de drops"
        description={`${drops.length} entrega(s) registrada(s) pela liderança.`}
      />

      <ErrorNote message={error} />

      {ranking.length > 0 && (
        <Card className="mb-6 p-4">
          <p className="mb-2 text-xs font-medium tracking-wide text-zinc-400 uppercase">
            Quem mais recebeu
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ranking.map((row) => (
              <Badge key={row.uid} tone={row.uid === member?.uid ? 'amber' : 'neutral'}>
                {row.uid === member?.uid ? 'Você' : row.nick} · {row.count}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Field label="Buscar">
          <Input
            placeholder="Nick ou nome do set…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <Field label="Mostrar">
          <Select value={who} onChange={(e) => setWho(e.target.value as 'todos' | 'eu')}>
            <option value="todos">Toda a guild</option>
            <option value="eu">Só o que eu recebi</option>
          </Select>
        </Field>
      </div>

      {drops.length === 0 ? (
        <EmptyState
          title="Nenhuma entrega registrada"
          description={
            isAdmin
              ? 'Quando um drop sair, registre pelo botão "entregou" na fila da peça, em Sets.'
              : 'A liderança registra as entregas conforme os drops saem.'
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState title="Nada com esses filtros" />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-zinc-800">
            {visible.map((drop) => (
              <li key={drop.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                <span
                  className={cx(
                    'text-sm font-medium',
                    drop.uid === member?.uid ? 'text-amber-400' : 'text-zinc-100',
                  )}
                >
                  {drop.uid === member?.uid ? 'Você' : drop.nick}
                </span>

                <span className="text-sm text-zinc-400">
                  recebeu {drop.setName}
                  {drop.slot !== 'item' && ` · ${SLOT_LABELS[drop.slot]}`}
                </span>

                <span className="ml-auto flex shrink-0 items-center gap-3">
                  <span className="text-xs text-zinc-500">{formatDateTime(drop.at)}</span>
                  {isAdmin && (
                    <button
                      type="button"
                      disabled={busy === drop.id}
                      onClick={() => void undo(drop)}
                      className="text-xs text-zinc-600 transition-colors hover:text-red-400 disabled:opacity-50"
                    >
                      {busy === drop.id ? '…' : 'apagar'}
                    </button>
                  )}
                </span>

                {drop.byNick && (
                  <span className="w-full text-xs text-zinc-600">
                    registrado por {drop.byNick}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
