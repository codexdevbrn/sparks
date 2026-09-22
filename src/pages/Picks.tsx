import { useEffect, useMemo, useState } from 'react'
import { onValue, ref, remove } from 'firebase/database'
import { db } from '../lib/firebase'
import { errorMessage } from '../lib/format'
import { listFrom } from '../lib/rtdb'
import { buildQueues, groupBySet, positionIn } from '../lib/reservations'
import {
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Spinner,
  cx,
} from '../components/ui'
import { SLOT_LABELS, queueKey } from '../types'
import type { Drop, Member, Reservation } from '../types'

type PlayerPicks = {
  member: Member
  reservations: Reservation[]
  /** Quantas entregas essa pessoa já recebeu. */
  received: number
}

/**
 * Visão do admin: cada player da guild e o que escolheu.
 *
 * Mostra também quem não escolheu nada — para o admin, essa é a informação mais
 * acionável da tela, porque é quem precisa ser cobrado.
 */
export function Picks() {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [reservations, setReservations] = useState<Reservation[] | null>(null)
  const [drops, setDrops] = useState<Drop[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const unsubMembers = onValue(
      ref(db, 'members'),
      (snap) => setMembers(listFrom<Member>(snap.val(), 'uid')),
      (err) => setError(errorMessage(err)),
    )

    const unsubRes = onValue(
      ref(db, 'reservations'),
      (snap) => setReservations(listFrom<Reservation>(snap.val())),
      (err) => setError(errorMessage(err)),
    )

    // Quanto cada um já recebeu é o contraponto da fila: sem isso o admin
    // ordena no escuro.
    const unsubDrops = onValue(
      ref(db, 'drops'),
      (snap) => setDrops(listFrom<Drop>(snap.val())),
      () => setDrops([]),
    )

    return () => {
      unsubMembers()
      unsubRes()
      unsubDrops()
    }
  }, [])

  const queues = useMemo(() => buildQueues(reservations ?? []), [reservations])

  const { withPicks, withoutPicks, total } = useMemo(() => {
    const byUid = new Map<string, Reservation[]>()
    for (const res of reservations ?? []) {
      const list = byUid.get(res.uid) ?? []
      list.push(res)
      byUid.set(res.uid, list)
    }

    const receivedByUid = new Map<string, number>()
    for (const drop of drops) {
      receivedByUid.set(drop.uid, (receivedByUid.get(drop.uid) ?? 0) + 1)
    }

    const term = search.trim().toLowerCase()
    const players: PlayerPicks[] = (members ?? [])
      .filter((m) => m.role !== 'pending')
      .filter((m) => !term || (m.nick || m.displayName || '').toLowerCase().includes(term))
      .map((m) => ({
        member: m,
        reservations: byUid.get(m.uid) ?? [],
        received: receivedByUid.get(m.uid) ?? 0,
      }))

    const byName = (a: PlayerPicks, b: PlayerPicks) =>
      (a.member.nick || a.member.email || '').localeCompare(b.member.nick || b.member.email || '')

    return {
      // Mais pedidos primeiro: quem está querendo mais coisa aparece no topo.
      withPicks: players
        .filter((p) => p.reservations.length > 0)
        .sort((a, b) => b.reservations.length - a.reservations.length || byName(a, b)),
      withoutPicks: players.filter((p) => p.reservations.length === 0).sort(byName),
      total: reservations?.length ?? 0,
    }
  }, [members, reservations, drops, search])

  /** As regras permitem que o admin tire qualquer um de qualquer fila. */
  async function release(res: Reservation) {
    if (!confirm(`Tirar ${res.nick} da fila de ${res.setName} · ${SLOT_LABELS[res.slot]}?`)) return
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

  if (members === null || reservations === null) return <Spinner />

  const players = withPicks.length + withoutPicks.length

  return (
    <>
      <PageHeader
        title="Escolhas da guild"
        description={`${players} player(es) · ${total} pedido(s) no total. A ordem de cada fila se ajusta em Sets.`}
      />

      <ErrorNote message={error} />

      <div className="mb-6 max-w-xs">
        <Field label="Buscar player">
          <Input placeholder="Nick…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
      </div>

      {players === 0 ? (
        <EmptyState
          title={search ? 'Nenhum player com esse nick' : 'Nenhum player aprovado ainda'}
          description={search ? undefined : 'Aprove membros em Membros para eles começarem a escolher.'}
        />
      ) : (
        <div className="space-y-4">
          {withPicks.map((player) => (
            <PlayerCard
              key={player.member.uid}
              player={player}
              queues={queues}
              busy={busy}
              onRelease={(res) => void release(res)}
            />
          ))}

          {withoutPicks.length > 0 && (
            <section className="pt-4">
              <h2 className="mb-3 text-xs font-medium tracking-wide text-zinc-500 uppercase">
                Ainda não escolheram ({withoutPicks.length})
              </h2>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-zinc-800">
                  {withoutPicks.map(({ member, received }) => (
                    <li key={member.uid} className="flex items-center gap-3 px-5 py-3">
                      <Avatar member={member} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-zinc-300">
                          {member.nick || member.displayName || 'sem nick'}
                        </p>
                        <p className="truncate text-xs text-zinc-500">
                          {member.charClass || 'classe não definida'}
                        </p>
                      </div>
                      {/* Quem já recebeu e não pediu mais nada é caso diferente
                          de quem nunca participou. */}
                      {received > 0 && <Badge tone="green">{received} recebido(s)</Badge>}
                      <span className="text-xs text-zinc-600">nenhum pedido</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </div>
      )}
    </>
  )
}

/* ---------------- card do player ---------------- */

function PlayerCard({
  player,
  queues,
  busy,
  onRelease,
}: {
  player: PlayerPicks
  queues: Map<string, Reservation[]>
  busy: string | null
  onRelease: (res: Reservation) => void
}) {
  const { member, reservations, received } = player
  const groups = groupBySet(reservations)

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 pb-4">
        <Avatar member={member} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-50">
            {member.nick || member.displayName || 'sem nick'}
          </p>
          <p className="truncate text-xs text-zinc-500">{member.charClass || 'classe não definida'}</p>
        </div>
        {member.role === 'admin' && <Badge tone="amber">Admin</Badge>}
        <Badge tone="blue">{reservations.length} pedido(s)</Badge>
        {received > 0 && <Badge tone="green">{received} recebido(s)</Badge>}
      </div>

      <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {groups.map((group) => (
          <div key={group.setId}>
            <p className="text-xs font-medium text-amber-400">
              {group.setName}
              {group.single && <span className="ml-1 text-zinc-500">· item único</span>}
            </p>
            <ul className="mt-1 space-y-0.5">
              {group.items.map((res) => {
                const queue = queues.get(queueKey(res.setId, res.slot))
                const position = positionIn(queue, res.uid)
                const total = queue?.length ?? 1

                return (
                  <li key={res.id} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-400">
                      {res.slot === 'item' ? 'Fila' : SLOT_LABELS[res.slot]}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {/* Ser o primeiro da fila é o que interessa de relance. */}
                      <span
                        className={cx(
                          'text-xs',
                          position === 1 ? 'font-medium text-emerald-400' : 'text-zinc-500',
                        )}
                      >
                        {position}º/{total}
                      </span>
                      <button
                        type="button"
                        disabled={busy === res.id}
                        onClick={() => onRelease(res)}
                        className="text-xs text-zinc-600 transition-colors hover:text-red-400 disabled:opacity-50"
                      >
                        {busy === res.id ? '…' : 'tirar'}
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Avatar({ member }: { member: Member }) {
  if (member.photoURL) {
    return <img src={member.photoURL} alt="" className="size-9 shrink-0 rounded-full" />
  }
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-800 text-xs">
      {(member.nick || '?').slice(0, 2).toUpperCase()}
    </span>
  )
}
