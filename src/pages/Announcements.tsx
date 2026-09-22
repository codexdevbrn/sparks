import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { onValue, push, ref, remove, serverTimestamp, update } from 'firebase/database'
import { useAuth } from '../lib/auth'
import { db } from '../lib/firebase'
import { errorMessage, formatDateTime } from '../lib/format'
import { listFrom } from '../lib/rtdb'
import { normalizeImageUrl } from '../lib/imageUrl'
import { ImageUrlField } from '../components/ImageUrlField'
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
import type { Announcement } from '../types'

export function Announcements() {
  const { member, isAdmin } = useAuth()
  const [items, setItems] = useState<Announcement[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null)

  useEffect(() => {
    // O RTDB ordena por um campo só, então "fixados primeiro, depois mais
    // recentes" é resolvido no cliente.
    return onValue(
      ref(db, 'announcements'),
      (snap) => {
        const list = listFrom<Announcement>(snap.val())
        list.sort(
          (a, b) => Number(b.pinned) - Number(a.pinned) || (b.createdAt ?? 0) - (a.createdAt ?? 0),
        )
        setItems(list)
        setError(null)
      },
      (err) => setError(errorMessage(err)),
    )
  }, [])

  async function handleDelete(item: Announcement) {
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

  return (
    <>
      <PageHeader
        title="Anúncios"
        description="Avisos da liderança para a guild."
        action={isAdmin && <Button onClick={() => setEditing('new')}>Novo anúncio</Button>}
      />

      <ErrorNote message={error} />

      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhum anúncio ainda"
          description={isAdmin ? 'Publique o primeiro aviso da guild.' : 'A liderança ainda não publicou nada.'}
        />
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <Card key={item.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {item.pinned && <Badge tone="amber">Fixado</Badge>}
                    <h2 className="text-base font-semibold text-zinc-50">{item.title}</h2>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {item.authorName} · {formatDateTime(item.createdAt)}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => void handleTogglePin(item)}>
                      {item.pinned ? 'Desafixar' : 'Fixar'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(item)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void handleDelete(item)}>
                      Excluir
                    </Button>
                  </div>
                )}
              </div>
              <p className="mt-3 text-sm whitespace-pre-wrap text-zinc-300">{item.body}</p>

              <AnnouncementImage url={item.imageUrl} />
            </Card>
          ))}
        </div>
      )}

      {editing && member && (
        <AnnouncementForm
          key={editing === 'new' ? 'new' : editing.id}
          item={editing === 'new' ? null : editing}
          authorUid={member.uid}
          authorName={member.nick}
          onClose={() => setEditing(null)}
        />
      )}
    </>
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
