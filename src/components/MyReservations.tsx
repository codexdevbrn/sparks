import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { onValue, ref, remove } from 'firebase/database'
import { db } from '../lib/firebase'
import { errorMessage } from '../lib/format'
import { listFrom } from '../lib/rtdb'
import { buildQueues, groupBySet, positionIn } from '../lib/reservations'
import { Badge, Button, Card, EmptyState, ErrorNote, Spinner, cx } from './ui'
import { SLOT_LABELS, queueKey } from '../types'
import type { Reservation } from '../types'

/** O que este usuário pediu, agrupado por set, com a posição em cada fila. */
export function MyReservations({ uid }: { uid: string }) {
  const [all, setAll] = useState<Reservation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    // Precisa do nó inteiro, e não só das próprias entradas, para saber em que
    // posição da fila a pessoa está.
    return onValue(
      ref(db, 'reservations'),
      (snap) => {
        setAll(listFrom<Reservation>(snap.val()))
        setError(null)
      },
      (err) => {
        setError(errorMessage(err))
        setAll([])
      },
    )
  }, [])

  const queues = useMemo(() => buildQueues(all ?? []), [all])
  const mine = useMemo(() => (all ?? []).filter((r) => r.uid === uid), [all, uid])
  const groups = useMemo(() => groupBySet(mine), [mine])

  async function leave(res: Reservation) {
    setBusy(res.id)
    setError(null)
    try {
      await remove(ref(db, `reservations/${res.id}`))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (all === null) return <Spinner label="Carregando filas…" />

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-400 uppercase">
          Minhas filas {mine.length > 0 && `(${mine.length})`}
        </h2>
        {mine.length > 0 && (
          <Link to="/sets" className="text-xs text-amber-400 hover:text-amber-300">
            Entrar em mais
          </Link>
        )}
      </div>

      <ErrorNote message={error} />

      {mine.length === 0 ? (
        <EmptyState
          title="Você não está em nenhuma fila"
          description="Escolha os sets e itens que quer dropar."
          action={
            <Link to="/sets">
              <Button>Ver sets e itens</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <Card key={group.setId} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-50">{group.setName}</h3>
                <Badge>{group.charClass}</Badge>
                {group.single && <Badge tone="blue">item único</Badge>}
              </div>

              <ul className="mt-3 divide-y divide-zinc-800 border-t border-zinc-800">
                {group.items.map((res) => {
                  const queue = queues.get(queueKey(res.setId, res.slot))
                  const position = positionIn(queue, uid)
                  const total = queue?.length ?? 1

                  return (
                    <li key={res.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="text-sm text-zinc-300">
                        {res.slot === 'item' ? 'Fila' : SLOT_LABELS[res.slot]}
                      </span>

                      <div className="flex items-center gap-3">
                        <span
                          className={cx(
                            'text-xs',
                            position === 1 ? 'font-medium text-emerald-400' : 'text-zinc-500',
                          )}
                        >
                          {position}º de {total}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === res.id}
                          onClick={() => void leave(res)}
                        >
                          {busy === res.id ? 'Saindo…' : 'Sair'}
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
