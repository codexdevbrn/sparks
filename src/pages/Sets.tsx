import { useEffect, useMemo, useState } from 'react'
// `set` do SDK é renomeado porque `set` aqui é sempre um GuildSet.
import { onValue, push, ref, remove, serverTimestamp, set as writeValue, update } from 'firebase/database'
import { useAuth } from '../lib/auth'
import { db } from '../lib/firebase'
import { errorMessage, isPermissionDenied } from '../lib/format'
import { listFrom, mapFrom } from '../lib/rtdb'
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
import { CHAR_CLASSES, SLOT_LABELS, isSingleItem, reservationId, slotList } from '../types'
import type { GuildSet, Reservation, SlotKey } from '../types'
import { SEED_SETS } from '../data/seedSets'

export function Sets() {
  const { member, isAdmin } = useAuth()
  const [sets, setSets] = useState<GuildSet[] | null>(null)
  const [reservations, setReservations] = useState<Map<string, Reservation> | null>(null)
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
      (snap) => setReservations(mapFrom<Reservation>(snap.val())),
      (err) => setError(errorMessage(err)),
    )

    return () => {
      unsubSets()
      unsubRes()
    }
  }, [])

  const myReservations = useMemo(() => {
    if (!reservations || !member) return []
    return [...reservations.values()]
      .filter((r) => r.uid === member.uid)
      .sort((a, b) => a.setName.localeCompare(b.setName))
  }, [reservations, member])

  const visibleSets = useMemo(() => {
    if (!sets) return []
    const term = search.trim().toLowerCase()
    return sets.filter((set) => {
      if (filterClass && set.charClass !== filterClass) return false
      if (term && !set.name.toLowerCase().includes(term)) return false
      if (onlyMine && member && reservations) {
        const mine = slotList(set.slots).some(
          (slot) => reservations.get(reservationId(set.id, slot))?.uid === member.uid,
        )
        if (!mine) return false
      }
      return true
    })
  }, [sets, filterClass, search, onlyMine, member, reservations])

  /* ---------------- reservas (todo membro, admin incluído) ---------------- */

  /** Escreve a reserva e propaga o erro — quem chama decide como reportar. */
  async function createReservation(set: GuildSet, slot: SlotKey) {
    if (!member) throw new Error('Sessão inválida.')
    await writeValue(ref(db, `reservations/${reservationId(set.id, slot)}`), {
      setId: set.id,
      setName: set.name,
      charClass: set.charClass,
      slot,
      uid: member.uid,
      nick: member.nick,
      createdAt: serverTimestamp(),
    })
  }

  async function reserve(set: GuildSet, slot: SlotKey) {
    const id = reservationId(set.id, slot)
    setBusySlot(id)
    setError(null)
    try {
      await createReservation(set, slot)
    } catch (err) {
      // A regra só aceita escrita em nó inexistente; recusa aqui significa,
      // na prática, que alguém reservou a peça primeiro.
      setError(
        isPermissionDenied(err)
          ? `${set.name} · ${SLOT_LABELS[slot]} acabou de ser reservada por outra pessoa.`
          : errorMessage(err),
      )
    } finally {
      setBusySlot(null)
    }
  }

  async function release(set: GuildSet, slot: SlotKey) {
    const id = reservationId(set.id, slot)
    setBusySlot(id)
    setError(null)
    try {
      await remove(ref(db, `reservations/${id}`))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusySlot(null)
    }
  }

  async function reserveWholeSet(set: GuildSet) {
    const free = slotList(set.slots).filter((slot) => !reservations?.has(reservationId(set.id, slot)))
    if (free.length === 0) return
    setBusySet(set.id)
    setError(null)
    try {
      const results = await Promise.allSettled(free.map((slot) => createReservation(set, slot)))
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed > 0) {
        setError(`${failed} de ${free.length} peça(s) já haviam sido reservadas por outra pessoa.`)
      }
    } finally {
      setBusySet(null)
    }
  }

  /* ---------------- catálogo (só admin) ---------------- */

  /** Excluir o cadastro remove as reservas dele. Escrita multi-path: tudo ou nada. */
  async function handleDelete(set: GuildSet) {
    if (!confirm(`Excluir "${set.name}" e todas as reservas dele?`)) return
    setBusyAdmin(true)
    setError(null)
    try {
      const updates: Record<string, null> = { [`sets/${set.id}`]: null }
      for (const res of reservations?.values() ?? []) {
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
      // Uma escrita multi-path: o catálogo aparece inteiro de uma vez.
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

  if (sets === null || reservations === null) return <Spinner />

  return (
    <>
      <PageHeader
        title="Sets e itens"
        description="Reserve o que você quer dropar. Uma peça reservada fica exclusiva sua."
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

      {myReservations.length > 0 && (
        <Card className="mb-6 p-4">
          <p className="mb-2 text-xs font-medium tracking-wide text-zinc-400 uppercase">
            Minhas reservas ({myReservations.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {myReservations.map((r) => (
              <Badge key={r.id} tone="amber">
                {r.setName}
                {r.slot !== 'item' && ` · ${SLOT_LABELS[r.slot]}`}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Field label="Buscar">
          <Input placeholder="Nome do set ou item…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
            Só onde tenho reserva
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
              reservations={reservations}
              myUid={member?.uid}
              isAdmin={isAdmin}
              busySlot={busySlot}
              busySet={busySet}
              busyAdmin={busyAdmin}
              onReserve={reserve}
              onRelease={release}
              onReserveAll={reserveWholeSet}
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
  reservations: Map<string, Reservation>
  myUid: string | undefined
  isAdmin: boolean
  busySlot: string | null
  busySet: string | null
  busyAdmin: boolean
  onReserve: (set: GuildSet, slot: SlotKey) => void
  onRelease: (set: GuildSet, slot: SlotKey) => void
  onReserveAll: (set: GuildSet) => void
  onEdit: () => void
  onDelete: () => void
}

function SetCard({
  set,
  reservations,
  myUid,
  isAdmin,
  busySlot,
  busySet,
  busyAdmin,
  onReserve,
  onRelease,
  onReserveAll,
  onEdit,
  onDelete,
}: SetCardProps) {
  const slots = slotList(set.slots)
  const single = isSingleItem(set.slots)
  const taken = slots.filter((slot) => reservations.has(reservationId(set.id, slot))).length
  const allTaken = slots.length > 0 && taken === slots.length

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
          {!single && (
            <Badge tone={allTaken ? 'red' : taken > 0 ? 'amber' : 'green'}>
              {taken}/{slots.length}
            </Badge>
          )}
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
        {slots.map((slot) => {
          const id = reservationId(set.id, slot)
          const res = reservations.get(id)
          const isMineSlot = res?.uid === myUid
          const busy = busySlot === id

          return (
            <li key={slot} className="flex items-center justify-between gap-3 py-2">
              {/* Num item único não existe "peça" a nomear. */}
              <span className="text-sm text-zinc-300">{single ? 'Reserva' : SLOT_LABELS[slot]}</span>

              <div className="flex items-center gap-2">
                {res ? (
                  <span
                    className={cx('text-xs font-medium', isMineSlot ? 'text-amber-400' : 'text-zinc-500')}
                  >
                    {isMineSlot ? 'Você' : res.nick}
                  </span>
                ) : (
                  <span className="text-xs text-zinc-600">livre</span>
                )}

                {res ? (
                  (isMineSlot || isAdmin) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => onRelease(set, slot)}
                    >
                      Liberar
                    </Button>
                  )
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => onReserve(set, slot)}
                  >
                    Reservar
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {/* Atalho só faz sentido com mais de uma peça livre. */}
      {!single && !allTaken && slots.length > 1 && (
        <Button
          variant="primary"
          size="sm"
          className="mt-4 w-full"
          disabled={busySet === set.id}
          onClick={() => onReserveAll(set)}
        >
          {busySet === set.id ? 'Reservando…' : 'Reservar peças livres'}
        </Button>
      )}
    </Card>
  )
}
