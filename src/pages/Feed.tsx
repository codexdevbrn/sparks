import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { onValue, push, ref, remove, serverTimestamp, update } from 'firebase/database'
import { useAuth } from '../lib/auth'
import { db } from '../lib/firebase'
import { errorMessage, formatDateTime } from '../lib/format'
import { listFrom } from '../lib/rtdb'
import { normalizeImageUrl } from '../lib/imageUrl'
import { notifyDiscord } from '../lib/discord'
import { ImageUrlField } from '../components/ImageUrlField'
import { EventCard, EventForm, deleteEventCascade, effectiveStartsAt } from './Events'
import { PollCard, PollForm, deletePollCascade } from './Polls'
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
  Spinner,
  Textarea,
} from '../components/ui'
import type { Announcement, GuildEvent, Poll } from '../types'

/**
 * A página principal é um feed: anúncios, eventos e enquetes juntos, em
 * ordem — fixado primeiro, depois mais recente. Cada tipo mantém seu próprio
 * card interativo (RSVP no evento, voto na enquete), reaproveitado das
 * telas dedicadas (Eventos, Enquetes), que continuam existindo pra quem
 * quer ver só aquilo.
 */
type FeedEntry =
  | { kind: 'announcement'; sortAt: number; pinned: boolean; item: Announcement }
  | { kind: 'event'; sortAt: number; pinned: boolean; item: GuildEvent }
  | { kind: 'poll'; sortAt: number; pinned: false; item: Poll }

export function Feed() {
  const { member, isAdmin } = useAuth()
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null)
  const [events, setEvents] = useState<GuildEvent[] | null>(null)
  const [polls, setPolls] = useState<Poll[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | 'new' | null>(null)
  const [editingEvent, setEditingEvent] = useState<GuildEvent | 'new' | null>(null)
  const [creatingPoll, setCreatingPoll] = useState(false)

  useEffect(() => {
    const unsubA = onValue(
      ref(db, 'announcements'),
      (snap) => setAnnouncements(listFrom<Announcement>(snap.val())),
      (err) => setError(errorMessage(err)),
    )
    const unsubE = onValue(
      ref(db, 'events'),
      (snap) => setEvents(listFrom<GuildEvent>(snap.val())),
      (err) => setError(errorMessage(err)),
    )
    const unsubP = onValue(
      ref(db, 'polls'),
      (snap) => setPolls(listFrom<Poll>(snap.val())),
      (err) => setError(errorMessage(err)),
    )
    return () => {
      unsubA()
      unsubE()
      unsubP()
    }
  }, [])

  // Evento recorrente muda de "próxima ocorrência" com o tempo, sem escrita
  // no banco — só recalculando aqui, igual a tela de Eventos.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const loading = announcements === null || events === null || polls === null

  const feed = useMemo(() => {
    const entries: FeedEntry[] = []

    for (const a of announcements ?? []) {
      entries.push({ kind: 'announcement', sortAt: a.createdAt ?? 0, pinned: Boolean(a.pinned), item: a })
    }

    for (const e of events ?? []) {
      const at = effectiveStartsAt(e, now)
      const isPast = !e.recurrence && at < now
      if (isPast) continue
      entries.push({ kind: 'event', sortAt: e.createdAt ?? 0, pinned: Boolean(e.pinned), item: e })
    }

    for (const p of polls ?? []) {
      entries.push({ kind: 'poll', sortAt: p.createdAt ?? 0, pinned: false, item: p })
    }

    return entries.sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.sortAt - a.sortAt,
    )
  }, [announcements, events, polls, now])

  async function handleDeleteAnnouncement(item: Announcement) {
    if (!confirm(`Excluir o anúncio "${item.title}"?`)) return
    try {
      await remove(ref(db, `announcements/${item.id}`))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function handleTogglePin(item: Announcement) {
    try {
      await update(ref(db, `announcements/${item.id}`), {
        pinned: !item.pinned,
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function handleDeleteEvent(item: GuildEvent) {
    if (!confirm(`Excluir o evento "${item.title}"?`)) return
    try {
      await deleteEventCascade(item.id)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function handleDeletePoll(item: Poll) {
    if (!confirm(`Excluir a enquete "${item.question}"?`)) return
    try {
      await deletePollCascade(item.id)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title="Anúncios"
        description="Tudo que a guild precisa ver: avisos, eventos e enquetes, em ordem."
        action={
          isAdmin && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setEditingAnnouncement('new')}>Novo anúncio</Button>
              <Button variant="secondary" onClick={() => setEditingEvent('new')}>
                Novo evento
              </Button>
              <Button variant="secondary" onClick={() => setCreatingPoll(true)}>
                Nova enquete
              </Button>
            </div>
          )
        }
      />

      <ErrorNote message={error} />

      {loading ? (
        <Spinner />
      ) : feed.length === 0 ? (
        <EmptyState
          title="Nada por aqui ainda"
          description={isAdmin ? 'Publique o primeiro aviso da guild.' : 'A liderança ainda não publicou nada.'}
        />
      ) : (
        <div className="space-y-4">
          {feed.map((entry) => {
            if (entry.kind === 'announcement') {
              return (
                <AnnouncementCard
                  key={`a-${entry.item.id}`}
                  item={entry.item}
                  isAdmin={isAdmin}
                  onTogglePin={() => void handleTogglePin(entry.item)}
                  onEdit={() => setEditingAnnouncement(entry.item)}
                  onDelete={() => void handleDeleteAnnouncement(entry.item)}
                />
              )
            }
            if (entry.kind === 'event') {
              return (
                <EventCard
                  key={`e-${entry.item.id}`}
                  event={entry.item}
                  now={now}
                  onEdit={() => setEditingEvent(entry.item)}
                  onDelete={() => void handleDeleteEvent(entry.item)}
                />
              )
            }
            return (
              <PollCard
                key={`p-${entry.item.id}`}
                poll={entry.item}
                isAdmin={isAdmin}
                onDelete={() => void handleDeletePoll(entry.item)}
              />
            )
          })}
        </div>
      )}

      {editingAnnouncement && member && (
        <AnnouncementForm
          key={editingAnnouncement === 'new' ? 'new' : editingAnnouncement.id}
          item={editingAnnouncement === 'new' ? null : editingAnnouncement}
          authorUid={member.uid}
          authorName={member.nick}
          onClose={() => setEditingAnnouncement(null)}
        />
      )}

      {editingEvent && (
        <EventForm
          key={editingEvent === 'new' ? 'new' : `ev-${editingEvent.id}`}
          item={editingEvent === 'new' ? null : editingEvent}
          onClose={() => setEditingEvent(null)}
        />
      )}

      {creatingPoll && <PollForm onClose={() => setCreatingPoll(false)} />}
    </>
  )
}

/* ---------------- card de anúncio ---------------- */

function AnnouncementCard({
  item,
  isAdmin,
  onTogglePin,
  onEdit,
  onDelete,
}: {
  item: Announcement
  isAdmin: boolean
  onTogglePin: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {item.pinned && <Badge tone="amber">Fixado</Badge>}
            <Badge tone="neutral">Anúncio</Badge>
            <h2 className="text-base font-semibold text-zinc-50">{item.title}</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {item.authorName} · {formatDateTime(item.createdAt)}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={onTogglePin}>
              {item.pinned ? 'Desafixar' : 'Fixar'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Editar
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              Excluir
            </Button>
          </div>
        )}
      </div>
      <p className="mt-3 text-sm whitespace-pre-wrap text-zinc-300">{item.body}</p>

      <AnnouncementImage url={item.imageUrl} />
    </Card>
  )
}

/**
 * Imagem do anúncio, que some sozinha se o link morrer.
 *
 * Hospedagem de terceiro cai, e um ícone de imagem quebrada no mural da guild é
 * pior que imagem nenhuma. O estado local resolve isso sem mexer no DOM por
 * fora do React.
 */
function AnnouncementImage({ url }: { url: string | undefined }) {
  const [broken, setBroken] = useState(false)

  if (!url || broken) return null

  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className="mt-3 block">
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className="max-h-96 w-full rounded-lg border border-zinc-800 object-contain"
      />
    </a>
  )
}

function AnnouncementForm({
  item,
  authorUid,
  authorName,
  onClose,
}: {
  item: Announcement | null
  authorUid: string
  authorName: string
  onClose: () => void
}) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [body, setBody] = useState(item?.body ?? '')
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? '')
  const [pinned, setPinned] = useState(item?.pinned ?? false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // Guarda já convertido: a tela do mural não deve saber de Drive.
      const image = normalizeImageUrl(imageUrl)

      if (item) {
        await update(ref(db, `announcements/${item.id}`), {
          title: title.trim(),
          body: body.trim(),
          imageUrl: image,
          pinned,
          updatedAt: serverTimestamp(),
        })
      } else {
        await push(ref(db, 'announcements'), {
          title: title.trim(),
          body: body.trim(),
          imageUrl: image,
          pinned,
          authorUid,
          authorName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        void notifyDiscord(`📢 **${title.trim()}**\n${body.trim().slice(0, 300)}`)
      }
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal open title={item ? 'Editar anúncio' : 'Novo anúncio'} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        <Field label="Título">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
        </Field>

        <Field label="Mensagem">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            maxLength={4000}
            required
          />
        </Field>

        <ImageUrlField value={imageUrl} onChange={setImageUrl} />

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            className="size-4 accent-amber-500"
          />
          Fixar no topo
        </label>

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
