import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { onValue, push, ref, remove, serverTimestamp, set, update } from 'firebase/database'
import { useAuth } from '../lib/auth'
import { db } from '../lib/firebase'
import { errorMessage, formatDateTime, fromDateTimeLocal, toDateTimeLocal } from '../lib/format'
import { nextOccurrence, rsvpCycleId, WEEKDAY_LABELS } from '../lib/recurrence'
import {
  effectiveStartsAt,
  eventDates,
  isEventPast,
  nextEventDate,
  upcomingCount,
} from '../lib/eventDates'
export { effectiveStartsAt } from '../lib/eventDates'
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

/**
 * Caminho do RTDB onde vivem as presenças desse evento nesse momento.
 *
 * Evento de várias datas reaproveita o mesmo mecanismo do recorrente: cada
 * data é um ciclo, com sua própria lista. Assim dá para confirmar um dia e
 * não o outro, e o ranking de presença conta cada data em separado.
 */
function rsvpPath(event: GuildEvent, now: number): string {
  if (event.recurrence) return `rsvpCycles/${event.id}/${rsvpCycleId(event.recurrence, now)}`
  if (event.dates) {
    const next = nextEventDate(event, now)
    return `rsvpCycles/${event.id}/${next?.key ?? 'sem-data'}`
  }
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
    const isPast = (e: GuildEvent) => isEventPast(e, now)

    const pinned = withDate
      .filter(({ event }) => event.pinned && !isPast(event))
      .sort((a, b) => a.at - b.at)
      .map((x) => x.event)

    const upcoming = withDate
      .filter(({ event }) => !event.pinned && !isPast(event))
      .sort((a, b) => a.at - b.at)
      .map((x) => x.event)

    const past = withDate
      .filter(({ event }) => isPast(event))
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
          <EventWhen event={event} now={now} />
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

/**
 * Nomes dos bosses cadastrados, para o seletor de tipo.
 *
 * Sai do banco e não de uma lista no código: o catálogo já é gerenciado na
 * página Bosses, e duplicar aqui garantiria divergir. Boss novo aparece
 * sozinho como tipo de evento.
 */
function useBossNames(): string[] {
  const [names, setNames] = useState<string[]>([])

  useEffect(() => {
    return onValue(
      ref(db, 'bosses'),
      (snap) => {
        const value = snap.val() as Record<string, { name?: string }> | null
        setNames(
          Object.values(value ?? {})
            .map((b) => b?.name)
            .filter((n): n is string => typeof n === 'string' && n.length > 0)
            .sort((a, b) => a.localeCompare(b)),
        )
      },
      () => setNames([]),
    )
  }, [])

  return names
}

/**
 * Quando o evento acontece.
 *
 * Com várias datas, a próxima aparece em destaque e as demais em seguida, com
 * as que já passaram riscadas — o card precisa dizer o que ainda vem sem
 * esconder o que passou.
 */
function EventWhen({ event, now }: { event: GuildEvent; now: number }) {
  if (event.recurrence) {
    return (
      <p className="mt-1 text-sm text-amber-400">
        Toda {WEEKDAY_LABELS[event.recurrence.weekday]} · próxima:{' '}
        {formatDateTime(nextOccurrence(event.recurrence, now))}
      </p>
    )
  }

  const dates = eventDates(event)
  const next = nextEventDate(event, now)
  const restantes = upcomingCount(event, now)

  if (dates.length <= 1) {
    return <p className="mt-1 text-sm text-amber-400">{formatDateTime(next?.at)}</p>
  }

  return (
    <div className="mt-1">
      <p className="text-sm text-amber-400">
        {formatDateTime(next?.at)}
        <span className="ml-2 text-xs text-zinc-500">
          {restantes > 0 ? `${restantes} de ${dates.length} data(s) por vir` : 'todas já passaram'}
        </span>
      </p>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {dates.map((d) => {
          const passou = d.at < now
          return (
            <li
              key={d.key}
              className={cx(
                'text-xs',
                passou
                  ? 'text-zinc-600 line-through decoration-zinc-700'
                  : d.key === next?.key
                    ? 'font-medium text-amber-400'
                    : 'text-zinc-400',
              )}
            >
              {formatDateTime(d.at)}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function EventForm({ item, onClose }: { item: GuildEvent | null; onClose: () => void }) {
  const { member } = useAuth()
  const [title, setTitle] = useState(item?.title ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [type, setType] = useState<EventType>(item?.type ?? 'Castle Siege')
  const [recurring, setRecurring] = useState(Boolean(item?.recurrence))
  // Uma linha por data. Comeca com o que o evento ja tinha, ou uma linha vazia.
  const [dates, setDates] = useState<string[]>(() => {
    const existentes = eventDates(item ?? ({} as GuildEvent)).map((d) => toDateTimeLocal(d.at))
    return existentes.length > 0 ? existentes : ['']
  })
  const bossTypes = useBossNames()
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
    let dateMap: Record<string, number> | null = null

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
      const preenchidas = dates.map((d) => d.trim()).filter(Boolean)
      if (preenchidas.length === 0) {
        setError('Informe pelo menos uma data.')
        return
      }
      const parsed = preenchidas.map(fromDateTimeLocal)
      if (parsed.some((v) => v === null)) {
        setError('Uma das datas está inválida.')
        return
      }
      const unicas = [...new Set(parsed as number[])].sort((a, b) => a - b)
      if (unicas.length === 1) {
        // Data unica continua no formato antigo: assim as presencas seguem em
        // `rsvps/{id}` e nenhuma confirmacao ja dada se perde.
        ms = unicas[0]
      } else {
        dateMap = {}
        for (const at of unicas) dateMap[`d${at}`] = at
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
        dates: dateMap,
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
          : dateMap
            ? `${Object.keys(dateMap).length} datas, a partir de ${formatDateTime(Math.min(...Object.values(dateMap)))}`
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
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            {bossTypes.length > 0 && (
              <optgroup label="Bosses">
                {bossTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </optgroup>
            )}
            {/* Tipo de um evento antigo pode nao estar em nenhuma das listas
                (boss renomeado ou excluido); sem isso o Select cairia no
                primeiro item e trocaria o tipo sem ninguem pedir. */}
            {type && !EVENT_TYPES.includes(type as (typeof EVENT_TYPES)[number]) && !bossTypes.includes(type) && (
              <option value={type}>{type}</option>
            )}
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
          <Field
            label={dates.length > 1 ? `Datas (${dates.length})` : 'Data e hora'}
            hint="No fuso horário do seu computador. Cada data tem sua própria lista de presença."
          >
            <div className="space-y-2">
              {dates.map((value, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    type="datetime-local"
                    value={value}
                    onChange={(e) =>
                      setDates((cur) => cur.map((v, i) => (i === index ? e.target.value : v)))
                    }
                    required={index === 0}
                  />
                  {dates.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="Remover data"
                      onClick={() => setDates((cur) => cur.filter((_, i) => i !== index))}
                    >
                      ✕
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDates((cur) => [...cur, ''])}
              >
                + Adicionar data
              </Button>
            </div>
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
