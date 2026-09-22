import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { onValue, push, ref, remove, serverTimestamp, set, update } from 'firebase/database'
import { useAuth } from '../lib/auth'
import { db } from '../lib/firebase'
import { errorMessage, formatDateTime, fromDateTimeLocal, toDateTimeLocal } from '../lib/format'
import { nextOccurrence, rsvpCycleId, WEEKDAY_LABELS } from '../lib/recurrence'
import { listFrom } from '../lib/rtdb'
import { notifyDiscord } from '../lib/discord'
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
import type { EventType, GuildEvent, Recurrence, Rsvp, RsvpStatus, Weekday } from '../types'

/** Data usada para ordenar e para decidir se um evento já passou. */
export function effectiveStartsAt(event: GuildEvent, now: number): number {
  if (event.recurrence) return nextOccurrence(event.recurrence, now)
  return event.startsAt ?? 0
}

/** Caminho do RTDB onde vivem as presenças desse evento nesse momento. */
function rsvpPath(event: GuildEvent, now: number): string {
  if (event.recurrence) return `rsvpCycles/${event.id}/${rsvpCycleId(event.recurrence, now)}`
  return `rsvps/${event.id}`
}

/** Excluir o evento remove também as presenças, que vivem fora dele. Usado
 *  aqui e no feed principal (Anúncios), onde eventos também aparecem. */
export async function deleteEventCascade(id: string): Promise<void> {
  await update(ref(db), {
    [`events/${id}`]: null,
    [`rsvps/${id}`]: null,
    [`rsvpCycles/${id}`]: null,
  })
}

export function Events() {
  const { isAdmin } = useAuth()
  const [events, setEvents] = useState<GuildEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<GuildEvent | 'new' | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    return onValue(
      ref(db, 'events'),
      (snap) => setEvents(listFrom<GuildEvent>(snap.val())),
      (err) => setError(errorMessage(err)),
    )
  }, [])

  // Eventos recorrentes mudam de "próxima ocorrência" e de ciclo de RSVP com
  // o tempo, sem nenhuma escrita no banco — só recalculando aqui.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const { pinned, upcoming, past } = useMemo(() => {
    const all = events ?? []
    const withDate = all.map((e) => ({ event: e, at: effectiveStartsAt(e, now) }))
    const isPast = (e: GuildEvent, at: number) => !e.recurrence && at < now

    const pinned = withDate
      .filter(({ event, at }) => event.pinned && !isPast(event, at))
      .sort((a, b) => a.at - b.at)
      .map((x) => x.event)

    const upcoming = withDate
      .filter(({ event, at }) => !event.pinned && !isPast(event, at))
      .sort((a, b) => a.at - b.at)
      .map((x) => x.event)

    const past = withDate
      .filter(({ event, at }) => isPast(event, at))
      .sort((a, b) => b.at - a.at)
      .slice(0, 10)
      .map((x) => x.event)

    return { pinned, upcoming, past }
  }, [events, now])

  async function handleDelete(item: GuildEvent) {
    if (!confirm(`Excluir o evento "${item.title}"?`)) return
    try {
      await deleteEventCascade(item.id)
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

      {pinned.length === 0 && upcoming.length === 0 ? (
        <EmptyState
          title="Nenhum evento agendado"
          description={isAdmin ? 'Crie o próximo Castle Siege, BC ou caçada de boss.' : undefined}
        />
      ) : (
        <div className="space-y-4">
          {[...pinned, ...upcoming].map((item) => (
            <EventCard
              key={item.id}
              event={item}
              now={now}
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

export function EventCard({
  event,
  now,
  onEdit,
  onDelete,
}: {
  event: GuildEvent
  now: number
  onEdit: () => void
  onDelete: () => void
}) {
  const { member, isAdmin } = useAuth()
  const [rsvps, setRsvps] = useState<Rsvp[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const rsvpEnabled = event.rsvpEnabled !== false
  const path = rsvpPath(event, now)

  // As presenças ficam fora do nó do evento: assim a lista de eventos não
  // arrasta todas elas em cada leitura.
  useEffect(() => {
    if (!rsvpEnabled) return
    return onValue(
      ref(db, path),
      (snap) => setRsvps(listFrom<Rsvp>(snap.val(), 'uid')),
      (err) => setError(errorMessage(err)),
    )
  }, [path, rsvpEnabled])

  const mine = rsvps.find((r) => r.uid === member?.uid)
  const going = rsvps.filter((r) => r.status === 'going')
  const maybe = rsvps.filter((r) => r.status === 'maybe')

  /** Clicar de novo no status já marcado desfaz a confirmação. */
  async function answer(status: RsvpStatus) {
    if (!member) return
    setBusy(true)
    setError(null)
    try {
      if (mine?.status === status) {
        await remove(ref(db, `${path}/${member.uid}`))
      } else {
        await set(ref(db, `${path}/${member.uid}`), {
          uid: member.uid,
          nick: member.nick,
          status,
          updatedAt: serverTimestamp(),
        })
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className={cx('p-5', event.pinned && 'border-amber-500/40 bg-amber-500/5')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {event.pinned && <Badge tone="amber">Fixado</Badge>}
            <Badge tone="blue">{event.type}</Badge>
            <h2 className="text-base font-semibold text-zinc-50">{event.title}</h2>
          </div>
          <p className="mt-1 text-sm text-amber-400">
            {event.recurrence
              ? `Toda ${WEEKDAY_LABELS[event.recurrence.weekday]} · próxima: ${formatDateTime(
                  nextOccurrence(event.recurrence, now),
                )}`
              : formatDateTime(event.startsAt)}
          </p>
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

      {rsvpEnabled ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4">
            {(Object.keys(RSVP_LABELS) as RsvpStatus[]).map((status) => (
              <button
                key={status}
                type="button"
                disabled={busy}
                onClick={() => void answer(status)}
                title={mine?.status === status ? 'Clique para desfazer' : undefined}
                className={cx(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                  mine?.status === status
                    ? RSVP_TONE[status]
                    : 'border border-zinc-700 text-zinc-400 hover:text-zinc-100',
                )}
              >
                {RSVP_LABELS[status]}
                {mine?.status === status && ' ✕'}
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
        </>
      ) : (
        event.recurrence && (
          <p className="mt-4 border-t border-zinc-800 pt-4 text-xs text-zinc-500">
            Este evento não tem confirmação de presença.
          </p>
        )
      )}

      <div className="mt-2">
        <ErrorNote message={error} />
      </div>
    </Card>
  )
}

/* ---------------- formulário ---------------- */

const WEEKDAY_OPTIONS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

export function EventForm({ item, onClose }: { item: GuildEvent | null; onClose: () => void }) {
  const { member } = useAuth()
  const [title, setTitle] = useState(item?.title ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [type, setType] = useState<EventType>(item?.type ?? 'Castle Siege')
  const [recurring, setRecurring] = useState(Boolean(item?.recurrence))
  const [startsAt, setStartsAt] = useState(item?.startsAt ? toDateTimeLocal(item.startsAt) : '')
  const [weekday, setWeekday] = useState<Weekday>(item?.recurrence?.weekday ?? 0)
  const [time, setTime] = useState(
    item?.recurrence ? `${String(item.recurrence.hour).padStart(2, '0')}:${String(item.recurrence.minute).padStart(2, '0')}` : '17:00',
  )
  const [pinned, setPinned] = useState(item?.pinned ?? false)
  const [rsvpEnabled, setRsvpEnabled] = useState(item?.rsvpEnabled ?? true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!member) return

    let recurrence: Recurrence | null = null
    let ms: number | null = null

    if (recurring) {
      const [hourStr, minuteStr] = time.split(':')
      const hour = Number(hourStr)
      const minute = Number(minuteStr)
      if (Number.isNaN(hour) || Number.isNaN(minute)) {
        setError('Informe um horário válido.')
        return
      }
      recurrence = { weekday, hour, minute }
    } else {
      ms = fromDateTimeLocal(startsAt)
      if (ms === null) {
        setError('Informe uma data e hora válidas.')
        return
      }
    }

    setBusy(true)
    setError(null)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        type,
        startsAt: ms,
        recurrence,
        pinned,
        rsvpEnabled,
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
        const when = recurring
          ? `toda ${WEEKDAY_LABELS[weekday]} às ${time}`
          : formatDateTime(ms ?? undefined)
        void notifyDiscord(`🗓️ **Novo evento: ${title.trim()}** — ${when}`)
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

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
            className="size-4 accent-amber-500"
          />
          Evento recorrente (toda semana, no mesmo dia e hora)
        </label>

        {recurring ? (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Dia da semana">
              <Select value={weekday} onChange={(e) => setWeekday(Number(e.target.value) as Weekday)}>
                {WEEKDAY_OPTIONS.map((w) => (
                  <option key={w} value={w}>
                    {WEEKDAY_LABELS[w]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Horário">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            </Field>
          </div>
        ) : (
          <Field label="Data e hora" hint="No fuso horário do seu computador.">
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
            />
          </Field>
        )}

        <Field label="Descrição">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={2000}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            className="size-4 accent-amber-500"
          />
          Fixar no topo da agenda
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={rsvpEnabled}
            onChange={(e) => setRsvpEnabled(e.target.checked)}
            className="size-4 accent-amber-500"
          />
          Permitir confirmação de presença
        </label>

        {recurring && rsvpEnabled && (
          <p className="text-xs text-zinc-500">
            A lista de confirmação reseta sozinha 1h antes de cada ocorrência.
          </p>
        )}

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
