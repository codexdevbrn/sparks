import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { onValue, push, ref, serverTimestamp, set, update } from 'firebase/database'
import { useAuth } from '../lib/auth'
import { db } from '../lib/firebase'
import { errorMessage, formatDateTime, fromDateTimeLocal, toDateTimeLocal } from '../lib/format'
import { listFrom } from '../lib/rtdb'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Textarea,
  cx,
} from '../components/ui'
import { EVENT_TYPES, RSVP_LABELS } from '../types'
import type { EventType, GuildEvent, Rsvp, RsvpStatus } from '../types'

export function Events() {
  const { isAdmin } = useAuth()
  const [events, setEvents] = useState<GuildEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<GuildEvent | 'new' | null>(null)

  useEffect(() => {
    return onValue(
      ref(db, 'events'),
      (snap) => {
        const list = listFrom<GuildEvent>(snap.val())
        list.sort((a, b) => a.startsAt - b.startsAt)
        setEvents(list)
      },
      (err) => setError(errorMessage(err)),
    )
  }, [])

  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    const all = events ?? []
    return {
      upcoming: all.filter((e) => e.startsAt >= now),
      // Mais recentes primeiro, e só os últimos dez.
      past: all
        .filter((e) => e.startsAt < now)
        .reverse()
        .slice(0, 10),
    }
  }, [events])

  /** Excluir o evento remove também as presenças, que vivem fora dele. */
  async function handleDelete(item: GuildEvent) {
    if (!confirm(`Excluir o evento "${item.title}"?`)) return
    try {
      await update(ref(db), {
        [`events/${item.id}`]: null,
        [`rsvps/${item.id}`]: null,
      })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (events === null) return <Spinner />

  return (
    <>
      <PageHeader
        title="Eventos"
        description="Agenda da guild e confirmação de presença."
        action={isAdmin && <Button onClick={() => setEditing('new')}>Novo evento</Button>}
      />

      <ErrorNote message={error} />

      {upcoming.length === 0 ? (
        <EmptyState
          title="Nenhum evento agendado"
          description={isAdmin ? 'Crie o próximo Castle Siege, BC ou caçada de boss.' : undefined}
        />
      ) : (
        <div className="space-y-4">
          {upcoming.map((item) => (
            <EventCard
              key={item.id}
              event={item}
              onEdit={() => setEditing(item)}
              onDelete={() => void handleDelete(item)}
            />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xs font-medium tracking-wide text-zinc-500 uppercase">Já aconteceram</h2>
          <div className="space-y-2">
            {past.map((item) => (
              <Card key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3 opacity-60">
                <Badge>{item.type}</Badge>
                <span className="text-sm text-zinc-300">{item.title}</span>
                <span className="ml-auto text-xs text-zinc-500">{formatDateTime(item.startsAt)}</span>
                {isAdmin && (
                  <Button variant="ghost" size="sm" onClick={() => void handleDelete(item)}>
                    Excluir
                  </Button>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {editing && (
        <EventForm
          key={editing === 'new' ? 'new' : editing.id}
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

/* ---------------- card com RSVP ---------------- */

const RSVP_TONE: Record<RsvpStatus, string> = {
  going: 'bg-emerald-500 text-zinc-950',
  maybe: 'bg-amber-500 text-zinc-950',
  out: 'bg-zinc-700 text-zinc-100',
}

function EventCard({
  event,
  onEdit,
  onDelete,
}: {
  event: GuildEvent
  onEdit: () => void
  onDelete: () => void
}) {
  const { member, isAdmin } = useAuth()
  const [rsvps, setRsvps] = useState<Rsvp[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // As presenças ficam em `rsvps/{eventId}`, fora do nó do evento: assim a
  // lista de eventos não arrasta todas elas em cada leitura.
  useEffect(() => {
    return onValue(
      ref(db, `rsvps/${event.id}`),
      (snap) => setRsvps(listFrom<Rsvp>(snap.val(), 'uid')),
      (err) => setError(errorMessage(err)),
    )
  }, [event.id])

  const mine = rsvps.find((r) => r.uid === member?.uid)
  const going = rsvps.filter((r) => r.status === 'going')
  const maybe = rsvps.filter((r) => r.status === 'maybe')

  async function answer(status: RsvpStatus) {
    if (!member) return
    setBusy(true)
    setError(null)
    try {
      await set(ref(db, `rsvps/${event.id}/${member.uid}`), {
        uid: member.uid,
        nick: member.nick,
        status,
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone="blue">{event.type}</Badge>
            <h2 className="text-base font-semibold text-zinc-50">{event.title}</h2>
          </div>
          <p className="mt-1 text-sm text-amber-400">{formatDateTime(event.startsAt)}</p>
        </div>
        {isAdmin && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Editar
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              Excluir
            </Button>
          </div>
        )}
      </div>

      {event.description && (
        <p className="mt-3 text-sm whitespace-pre-wrap text-zinc-300">{event.description}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4">
        {(Object.keys(RSVP_LABELS) as RsvpStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            disabled={busy}
            onClick={() => void answer(status)}
            className={cx(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
              mine?.status === status
                ? RSVP_TONE[status]
                : 'border border-zinc-700 text-zinc-400 hover:text-zinc-100',
            )}
          >
            {RSVP_LABELS[status]}
          </button>
        ))}

        <span className="ml-auto text-xs text-zinc-500">
          {going.length} confirmado(s)
          {maybe.length > 0 && ` · ${maybe.length} talvez`}
        </span>
      </div>

      {going.length > 0 && (
        <p className="mt-3 text-xs text-zinc-500">{going.map((r) => r.nick).join(', ')}</p>
      )}

      <div className="mt-2">
        <ErrorNote message={error} />
      </div>
    </Card>
  )
}

/* ---------------- formulário ---------------- */

function EventForm({ item, onClose }: { item: GuildEvent | null; onClose: () => void }) {
  const { member } = useAuth()
  const [title, setTitle] = useState(item?.title ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [type, setType] = useState<EventType>(item?.type ?? 'Castle Siege')
  const [startsAt, setStartsAt] = useState(item ? toDateTimeLocal(item.startsAt) : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!member) return

    const ms = fromDateTimeLocal(startsAt)
    if (ms === null) {
      setError('Informe uma data e hora válidas.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        type,
        startsAt: ms,
      }
      if (item) {
        await update(ref(db, `events/${item.id}`), payload)
      } else {
        await push(ref(db, 'events'), {
          ...payload,
          createdBy: member.uid,
          createdByName: member.nick,
          createdAt: serverTimestamp(),
        })
      }
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal open title={item ? 'Editar evento' : 'Novo evento'} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        <Field label="Título">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
        </Field>

        <Field label="Tipo">
          <Select value={type} onChange={(e) => setType(e.target.value as EventType)}>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Data e hora" hint="No fuso horário do seu computador.">
          <Input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
        </Field>

        <Field label="Descrição">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={2000}
          />
        </Field>

        <ErrorNote message={error} />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
