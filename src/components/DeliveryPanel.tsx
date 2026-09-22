import { useMemo, useState } from 'react'
import { push, ref, remove, serverTimestamp, update } from 'firebase/database'
import { useAuth } from '../lib/auth'
import { db } from '../lib/firebase'
import { errorMessage, formatDateTime } from '../lib/format'
import { buildQueues, positionIn, progressFor } from '../lib/reservations'
import { Badge, Button, ErrorNote, Modal, cx } from './ui'
import { SLOT_LABELS, queueKey } from '../types'
import type { Drop, Member, Reservation } from '../types'

/**
 * Entrega peça a peça do que um player pediu.
 *
 * Um set sai aos poucos: o admin abre o pedido e vai marcando cada peça até
 * fechar. A posição na lista aparece como contexto, não como trava — quem
 * recebe primeiro é decisão da liderança, tomada fora do sistema.
 */
export function DeliveryPanel({
  target,
  reservations,
  drops,
  onClose,
}: {
  target: Member
  reservations: Reservation[]
  drops: Drop[]
  onClose: () => void
}) {
  const { member } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const queues = useMemo(() => buildQueues(reservations), [reservations])
  const sets = useMemo(
    () => progressFor(target.uid, reservations, drops),
    [target.uid, reservations, drops],
  )

  const totalPending = sets.reduce((n, s) => n + s.pending.length, 0)
  const totalDelivered = sets.reduce((n, s) => n + s.delivered.length, 0)

  /** Registra a entrega e tira a peça da lista de quem recebeu, de uma vez só. */
  async function deliver(res: Reservation) {
    if (!member) return
    setBusy(res.id)
    setError(null)
    try {
      const dropId = push(ref(db, 'drops')).key
      if (!dropId) throw new Error('Não foi possível gerar o registro.')

      await update(ref(db), {
        [`drops/${dropId}`]: {
          setId: res.setId,
          setName: res.setName,
          charClass: res.charClass,
          slot: res.slot,
          uid: res.uid,
          nick: res.nick,
          byUid: member.uid,
          byNick: member.nick,
          at: serverTimestamp(),
        },
        [`reservations/${res.id}`]: null,
      })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  /**
   * Apaga o registro de entrega. Não devolve a peça para a lista: as regras só
   * deixam a própria pessoa entrar numa fila, então o player precisa entrar de
   * novo se for o caso.
   */
  async function undo(drop: Drop) {
    if (!confirm(`Apagar o registro de ${drop.setName} · ${SLOT_LABELS[drop.slot]}?\n\nIsso não devolve a peça para a lista de ${drop.nick}.`)) {
      return
    }
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

  return (
    <Modal open title={`Entrega — ${target.nick || target.displayName || 'sem nick'}`} onClose={onClose}>
      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-4">
        <Badge tone="blue">{totalPending} a entregar</Badge>
        <Badge tone="green">{totalDelivered} entregue(s)</Badge>
        <span className="ml-auto text-xs text-zinc-500">{target.charClass || 'classe não definida'}</span>
      </div>

      <ErrorNote message={error} />

      {sets.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">
          Este player não pediu nada e nunca recebeu nada.
        </p>
      ) : (
        <div className="space-y-5">
          {sets.map((set) => {
            const done = set.delivered.length
            const total = done + set.pending.length
            const complete = set.pending.length === 0

            return (
              <section key={set.setId}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-zinc-50">{set.setName}</h3>
                  {set.single && <Badge tone="blue">item único</Badge>}
                  <span
                    className={cx(
                      'ml-auto text-xs font-medium',
                      complete ? 'text-emerald-400' : 'text-zinc-500',
                    )}
                  >
                    {done}/{total} {complete && '· completo'}
                  </span>
                </div>

                <ul className="mt-2 divide-y divide-zinc-800 rounded-lg border border-zinc-800">
                  {set.delivered.map((drop) => (
                    <li key={drop.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="text-emerald-500">✓</span>
                      <span className="text-sm text-zinc-400 line-through decoration-zinc-700">
                        {drop.slot === 'item' ? 'Item' : SLOT_LABELS[drop.slot]}
                      </span>
                      <span className="ml-auto text-xs text-zinc-600">{formatDateTime(drop.at)}</span>
                      <button
                        type="button"
                        disabled={busy === drop.id}
                        onClick={() => void undo(drop)}
                        className="shrink-0 text-xs text-zinc-700 transition-colors hover:text-red-400 disabled:opacity-50"
                      >
                        apagar
                      </button>
                    </li>
                  ))}

                  {set.pending.map((res) => {
                    const queue = queues.get(queueKey(res.setId, res.slot))
                    const position = positionIn(queue, target.uid)
                    const contested = (queue?.length ?? 1) > 1

                    return (
                      <li key={res.id} className="flex items-center gap-3 px-3 py-2">
                        <span className="text-zinc-700">○</span>
                        <span className="text-sm text-zinc-200">
                          {res.slot === 'item' ? 'Item' : SLOT_LABELS[res.slot]}
                        </span>

                        {/* Contexto, não trava: dá para entregar fora de ordem. */}
                        {contested && (
                          <span
                            className={cx(
                              'text-xs',
                              position === 1 ? 'text-emerald-400' : 'text-amber-400',
                            )}
                            title="Posição na ordem definida pela liderança"
                          >
                            {position}º de {queue?.length}
                          </span>
                        )}

                        <Button
                          size="sm"
                          className="ml-auto"
                          disabled={busy === res.id}
                          onClick={() => void deliver(res)}
                        >
                          {busy === res.id ? 'Entregando…' : 'Entregar'}
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
