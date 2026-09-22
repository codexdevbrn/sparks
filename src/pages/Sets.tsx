import { useEffect, useMemo, useState } from 'react'
// `set` do SDK é renomeado porque `set` aqui é sempre um GuildSet.
import { onValue, push, ref, remove, serverTimestamp, set as writeValue, update } from 'firebase/database'
import { useAuth } from '../lib/auth'
import { db } from '../lib/firebase'
import { errorMessage, isPermissionDenied } from '../lib/format'
import { listFrom } from '../lib/rtdb'
import { buildQueues, positionIn } from '../lib/reservations'
import { SetForm } from '../components/SetForm'
import {
  Badge,
  Button,
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
import { CHAR_CLASSES, SLOT_LABELS, isSingleItem, queueKey, reservationId, slotList } from '../types'
import type { GuildSet, Reservation, SlotKey } from '../types'
import { SEED_SETS } from '../data/seedSets'

export function Sets() {
  const { member, isAdmin } = useAuth()
  const [sets, setSets] = useState<GuildSet[] | null>(null)
  const [all, setAll] = useState<Reservation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busySlot, setBusySlot] = useState<string | null>(null)
  const [busySet, setBusySet] = useState<string | null>(null)
  const [busyAdmin, setBusyAdmin] = useState(false)
  const [editing, setEditing] = useState<GuildSet | 'new' | null>(null)

  const [filterClass, setFilterClass] = useState('')
  const [search, setSearch] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)

  useEffect(() => {
    const unsubSets = onValue(
      ref(db, 'sets'),
      (snap) => {
        const list = listFrom<GuildSet>(snap.val())
        list.sort((a, b) => a.charClass.localeCompare(b.charClass) || a.name.localeCompare(b.name))
        setSets(list)
      },
      (err) => setError(errorMessage(err)),
    )

    const unsubRes = onValue(
      ref(db, 'reservations'),
      (snap) => setAll(listFrom<Reservation>(snap.val())),
      (err) => setError(errorMessage(err)),
    )

    return () => {
      unsubSets()
      unsubRes()
    }
  }, [])

  const queues = useMemo(() => buildQueues(all ?? []), [all])

  const myCount = useMemo(
    () => (member ? (all ?? []).filter((r) => r.uid === member.uid).length : 0),
    [all, member],
  )

  const visibleSets = useMemo(() => {
    if (!sets) return []
    const term = search.trim().toLowerCase()
    return sets.filter((set) => {
      if (filterClass && set.charClass !== filterClass) return false
      if (term && !set.name.toLowerCase().includes(term)) return false
      if (onlyMine && member) {
        const mine = slotList(set.slots).some((slot) =>
          queues.get(queueKey(set.id, slot))?.some((r) => r.uid === member.uid),
        )
        if (!mine) return false
      }
      return true
    })
  }, [sets, filterClass, search, onlyMine, member, queues])

  /* ---------------- filas (todo membro, admin incluído) ---------------- */

  /** Entra na fila da peça e propaga o erro — quem chama decide como reportar. */
  async function joinQueue(set: GuildSet, slot: SlotKey) {
    if (!member) throw new Error('Sessão inválida.')
    await writeValue(ref(db, `reservations/${reservationId(set.id, slot, member.uid)}`), {
      setId: set.id,
      setName: set.name,
      charClass: set.charClass,
      slot,
      uid: member.uid,
      nick: member.nick,
      // Nasce no fim da fila; o admin reordena depois.
      order: Date.now(),
      createdAt: serverTimestamp(),
    })
  }

  async function join(set: GuildSet, slot: SlotKey) {
    if (!member) return
    const id = reservationId(set.id, slot, member.uid)
    setBusySlot(id)
    setError(null)
    try {
      await joinQueue(set, slot)
    } catch (err) {
      setError(
        isPermissionDenied(err)
          ? 'Não foi possível entrar na fila. Recarregue a página e tente de novo.'
          : errorMessage(err),
      )
    } finally {
      setBusySlot(null)
    }
  }

  async function leave(res: Reservation) {
    setBusySlot(res.id)
    setError(null)
    try {
      await remove(ref(db, `reservations/${res.id}`))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusySlot(null)
    }
  }

  /** Entra em todas as filas do set em que a pessoa ainda não está. */
  async function joinWholeSet(set: GuildSet) {
    if (!member) return
    const missing = slotList(set.slots).filter(
      (slot) => !queues.get(queueKey(set.id, slot))?.some((r) => r.uid === member.uid),
    )
    if (missing.length === 0) return
    setBusySet(set.id)
    setError(null)
    try {
      const results = await Promise.allSettled(missing.map((slot) => joinQueue(set, slot)))
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed > 0) setError(`${failed} de ${missing.length} fila(s) não aceitaram a entrada.`)
    } finally {
      setBusySet(null)
    }
  }

  /**
   * Registra que a peça foi entregue e tira a pessoa daquela fila, numa escrita
   * multi-path. Os outros continuam na fila — a peça pode dropar de novo.
   */
  async function markDelivered(res: Reservation) {
    if (!member) return
    const label = res.slot === 'item' ? res.setName : `${res.setName} · ${SLOT_LABELS[res.slot]}`
    if (!confirm(`Registrar que ${res.nick} recebeu ${label}?`)) return

    setBusySlot(res.id)
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
      setBusySlot(null)
    }
  }

  /**
   * Reordena trocando o `order` entre dois vizinhos, numa escrita multi-path.
   * Não renumera a fila, então duas reordenações simultâneas em pontos
   * diferentes da mesma fila não se atropelam.
   */
  async function swapOrder(a: Reservation, b: Reservation) {
    setBusySlot(a.id)
    setError(null)
    try {
      await update(ref(db), {
        [`reservations/${a.id}/order`]: b.order,
        [`reservations/${b.id}/order`]: a.order,
      })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusySlot(null)
    }
  }

  /* ---------------- catálogo (só admin) ---------------- */

  /** Excluir o cadastro remove as filas dele. Escrita multi-path: tudo ou nada. */
  async function handleDelete(set: GuildSet) {
    if (!confirm(`Excluir "${set.name}" e todas as filas dele?`)) return
    setBusyAdmin(true)
    setError(null)
    try {
      const updates: Record<string, null> = { [`sets/${set.id}`]: null }
      for (const res of all ?? []) {
        if (res.setId === set.id) updates[`reservations/${res.id}`] = null
      }
      await update(ref(db), updates)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyAdmin(false)
    }
  }

  async function handleSeed() {
    if (!confirm(`Adicionar ${SEED_SETS.length} sets clássicos ao catálogo?`)) return
    setBusyAdmin(true)
    setError(null)
    try {
      const existing = new Set((sets ?? []).map((s) => `${s.charClass}|${s.name}`))
      const novos = SEED_SETS.filter((s) => !existing.has(`${s.charClass}|${s.name}`))
      if (novos.length === 0) {
        setError('Todos os sets do seed já estão no catálogo.')
        return
      }
      const updates: Record<string, object> = {}
      for (const seed of novos) {
        const key = push(ref(db, 'sets')).key
        if (key) updates[`sets/${key}`] = { ...seed, createdAt: serverTimestamp() }
      }
      await update(ref(db), updates)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyAdmin(false)
    }
  }

  if (sets === null || all === null) return <Spinner />

  return (
    <>
      <PageHeader
        title="Sets e itens"
        description="Entre na fila do que você quer dropar. A ordem de cada fila é definida pela liderança."
        action={
          isAdmin && (
            <div className="flex gap-2">
              {sets.length > 0 && (
                <Button variant="secondary" disabled={busyAdmin} onClick={() => void handleSeed()}>
                  Carregar seed
                </Button>
              )}
              <Button onClick={() => setEditing('new')}>Cadastrar</Button>
            </div>
          )
        }
      />

      <ErrorNote message={error} />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Field label="Buscar">
          <Input
            placeholder="Nome do set ou item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <Field label="Classe">
          <Select value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
            <option value="">Todas</option>
            {CHAR_CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <label className="flex items-center gap-2 py-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(e) => setOnlyMine(e.target.checked)}
              className="size-4 accent-amber-500"
            />
            Só onde estou na fila {myCount > 0 && `(${myCount})`}
          </label>
        </div>
      </div>

      {sets.length === 0 ? (
        <EmptyState
          title="Nada cadastrado ainda"
          description={
            isAdmin
              ? 'Cadastre os sets e itens do seu servidor, ou comece pelo seed de sets clássicos.'
              : 'A liderança ainda não cadastrou nada.'
          }
          action={
            isAdmin && (
              <div className="flex gap-2">
                <Button disabled={busyAdmin} onClick={() => void handleSeed()}>
                  Carregar seed
                </Button>
                <Button variant="secondary" onClick={() => setEditing('new')}>
                  Cadastrar
                </Button>
              </div>
            )
          }
        />
      ) : visibleSets.length === 0 ? (
        <EmptyState title="Nada com esses filtros" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visibleSets.map((set) => (
            <SetCard
              key={set.id}
              set={set}
              queues={queues}
              myUid={member?.uid}
              isAdmin={isAdmin}
              busySlot={busySlot}
              busySet={busySet}
              busyAdmin={busyAdmin}
              onJoin={join}
              onLeave={leave}
              onJoinAll={joinWholeSet}
              onSwap={swapOrder}
              onDelivered={markDelivered}
              onEdit={() => setEditing(set)}
              onDelete={() => void handleDelete(set)}
            />
          ))}
        </div>
      )}

      {editing && (
        <SetForm
          key={editing === 'new' ? 'new' : editing.id}
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

/* ---------------- card ---------------- */

type SetCardProps = {
  set: GuildSet
  queues: Map<string, Reservation[]>
  myUid: string | undefined
  isAdmin: boolean
  busySlot: string | null
  busySet: string | null
  busyAdmin: boolean
  onJoin: (set: GuildSet, slot: SlotKey) => void
  onLeave: (res: Reservation) => void
  onJoinAll: (set: GuildSet) => void
  onSwap: (a: Reservation, b: Reservation) => void
  onDelivered: (res: Reservation) => void
  onEdit: () => void
  onDelete: () => void
}

function SetCard({
  set,
  queues,
  myUid,
  isAdmin,
  busySlot,
  busySet,
  busyAdmin,
  onJoin,
  onLeave,
  onJoinAll,
  onSwap,
  onDelivered,
  onEdit,
  onDelete,
}: SetCardProps) {
  const slots = slotList(set.slots)
  const single = isSingleItem(set.slots)

  const interested = slots.reduce(
    (sum, slot) => sum + (queues.get(queueKey(set.id, slot))?.length ?? 0),
    0,
  )
  const missing = myUid
    ? slots.filter((slot) => !queues.get(queueKey(set.id, slot))?.some((r) => r.uid === myUid)).length
    : 0

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-zinc-50">{set.name}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {set.charClass}
            {set.tier && ` · ${set.tier}`}
            {single && ' · item único'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {interested > 0 && <Badge tone="blue">{interested} na fila</Badge>}
          {isAdmin && (
            <>
              <Button variant="ghost" size="sm" onClick={onEdit}>
                Editar
              </Button>
              <Button variant="ghost" size="sm" disabled={busyAdmin} onClick={onDelete}>
                Excluir
              </Button>
            </>
          )}
        </div>
      </div>

      {set.notes && <p className="mt-2 text-xs text-zinc-400">{set.notes}</p>}

      <ul className="mt-4 divide-y divide-zinc-800 border-t border-zinc-800">
        {slots.map((slot) => (
          <SlotRow
            key={slot}
            set={set}
            slot={slot}
            single={single}
            queue={queues.get(queueKey(set.id, slot)) ?? []}
            myUid={myUid}
            isAdmin={isAdmin}
            busySlot={busySlot}
            onJoin={onJoin}
            onLeave={onLeave}
            onSwap={onSwap}
            onDelivered={onDelivered}
          />
        ))}
      </ul>

      {!single && missing > 0 && slots.length > 1 && (
        <Button
          variant="primary"
          size="sm"
          className="mt-4 w-full"
          disabled={busySet === set.id}
          onClick={() => onJoinAll(set)}
        >
          {busySet === set.id ? 'Entrando…' : `Entrar nas ${missing} fila(s) que faltam`}
        </Button>
      )}
    </Card>
  )
}

/* ---------------- linha de uma peça ---------------- */

function SlotRow({
  set,
  slot,
  single,
  queue,
  myUid,
  isAdmin,
  busySlot,
  onJoin,
  onLeave,
  onSwap,
  onDelivered,
}: {
  set: GuildSet
  slot: SlotKey
  single: boolean
  queue: Reservation[]
  myUid: string | undefined
  isAdmin: boolean
  busySlot: string | null
  onJoin: (set: GuildSet, slot: SlotKey) => void
  onLeave: (res: Reservation) => void
  onSwap: (a: Reservation, b: Reservation) => void
  onDelivered: (res: Reservation) => void
}) {
  const myPosition = myUid ? positionIn(queue, myUid) : 0
  const mine = myPosition > 0 ? queue[myPosition - 1] : undefined
  const busy = mine ? busySlot === mine.id : busySlot === `${set.id}__${slot}__${myUid}`

  return (
    <li className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-zinc-300">{single ? 'Fila' : SLOT_LABELS[slot]}</span>

        <div className="flex items-center gap-2">
          {queue.length === 0 ? (
            <span className="text-xs text-zinc-600">ninguém ainda</span>
          ) : (
            <span className="text-xs text-zinc-500">
              {queue.length} na fila
              {myPosition > 0 && <span className="text-amber-400"> · você é {myPosition}º</span>}
            </span>
          )}

          {mine ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onLeave(mine)}>
              Sair
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => onJoin(set, slot)}>
              Entrar
            </Button>
          )}
        </div>
      </div>

      {queue.length > 0 && (
        <ol className="mt-1.5 space-y-0.5">
          {queue.map((res, index) => (
            <li key={res.id} className="flex items-center gap-2 text-xs">
              <span className="w-4 shrink-0 text-right text-zinc-600">{index + 1}º</span>
              <span className={cx('truncate', res.uid === myUid ? 'text-amber-400' : 'text-zinc-400')}>
                {res.uid === myUid ? 'Você' : res.nick}
              </span>

              {isAdmin && queue.length > 1 && (
                <span className="ml-auto flex shrink-0 gap-1">
                  <QueueArrow
                    label="Subir"
                    symbol="↑"
                    disabled={index === 0 || busySlot !== null}
                    onClick={() => onSwap(res, queue[index - 1])}
                  />
                  <QueueArrow
                    label="Descer"
                    symbol="↓"
                    disabled={index === queue.length - 1 || busySlot !== null}
                    onClick={() => onSwap(res, queue[index + 1])}
                  />
                </span>
              )}

              {isAdmin && (
                <span
                  className={cx('flex shrink-0 gap-2', queue.length > 1 ? '' : 'ml-auto')}
                >
                  {/* Entregar tira a pessoa desta fila; os outros continuam. */}
                  <button
                    type="button"
                    disabled={busySlot !== null}
                    onClick={() => onDelivered(res)}
                    className="text-zinc-500 transition-colors hover:text-emerald-400 disabled:opacity-50"
                  >
                    entregou
                  </button>
                  {res.uid !== myUid && (
                    <button
                      type="button"
                      disabled={busySlot !== null}
                      onClick={() => onLeave(res)}
                      className="text-zinc-600 transition-colors hover:text-red-400 disabled:opacity-50"
                    >
                      remover
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}

function QueueArrow({
  label,
  symbol,
  disabled,
  onClick,
}: {
  label: string
  symbol: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded px-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {symbol}
    </button>
  )
}
