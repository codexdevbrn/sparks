import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { onValue, ref, remove } from 'firebase/database'
import { db } from '../lib/firebase'
import { errorMessage } from '../lib/format'
import { listFrom } from '../lib/rtdb'
import { groupBySet } from '../lib/reservations'
import { Badge, Button, Card, EmptyState, ErrorNote, Spinner } from './ui'
import { SLOT_LABELS } from '../types'
import type { Reservation } from '../types'

/** Lista o que este usuário reservou, agrupado por set, com opção de liberar. */
export function MyReservations({ uid }: { uid: string }) {
  const [mine, setMine] = useState<Reservation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    // O nó é pequeno e já é lido inteiro na página Sets; filtrar aqui evita
    // precisar de `.indexOn` nas regras.
    return onValue(
      ref(db, 'reservations'),
      (snap) => {
        setMine(listFrom<Reservation>(snap.val()).filter((r) => r.uid === uid))
        setError(null)
      },
      (err) => {
        setError(errorMessage(err))
        setMine([])
      },
    )
  }, [uid])

  const groups = useMemo(() => groupBySet(mine ?? []), [mine])

  async function release(res: Reservation) {
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

  if (mine === null) return <Spinner label="Carregando reservas…" />

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-400 uppercase">
          Minhas reservas {mine.length > 0 && `(${mine.length})`}
        </h2>
        {mine.length > 0 && (
          <Link to="/sets" className="text-xs text-amber-400 hover:text-amber-300">
            Reservar mais
          </Link>
        )}
      </div>

      <ErrorNote message={error} />

      {mine.length === 0 ? (
        <EmptyState
          title="Você ainda não reservou nada"
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
                {group.items.map((res) => (
                  <li key={res.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm text-zinc-300">
                      {res.slot === 'item' ? 'Reservado' : SLOT_LABELS[res.slot]}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === res.id}
                      onClick={() => void release(res)}
                    >
                      {busy === res.id ? 'Liberando…' : 'Liberar'}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
