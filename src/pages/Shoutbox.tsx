import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { onValue, push, ref, remove, serverTimestamp } from 'firebase/database'
import { useAuth } from '../lib/auth'
import { db } from '../lib/firebase'
import { errorMessage, formatDateTime } from '../lib/format'
import { listFrom } from '../lib/rtdb'
import { Button, Card, EmptyState, ErrorNote, PageHeader, Spinner, Textarea, cx } from '../components/ui'
import type { Shout } from '../types'

/**
 * Recado curto e informal — o "vou chegar atrasado hoje", "bora BC agora?"
 * que não merece um anúncio formal (esse é só admin). Qualquer membro posta;
 * cada um apaga o próprio, admin apaga qualquer um.
 */
export function Shoutbox() {
  const { member, isAdmin } = useAuth()
  const [shouts, setShouts] = useState<Shout[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyDelete, setBusyDelete] = useState<string | null>(null)

  useEffect(() => {
    return onValue(
      ref(db, 'shouts'),
      (snap) => setShouts(listFrom<Shout>(snap.val())),
      (err) => setError(errorMessage(err)),
    )
  }, [])

  const sorted = useMemo(
    () => [...(shouts ?? [])].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [shouts],
  )

  async function post(event: FormEvent) {
    event.preventDefault()
    if (!member) return
    const trimmed = text.trim()
    if (!trimmed) return

    setBusy(true)
    setError(null)
    try {
      await push(ref(db, 'shouts'), {
        uid: member.uid,
        nick: member.nick,
        text: trimmed,
        createdAt: serverTimestamp(),
      })
      setText('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function del(shout: Shout) {
    setBusyDelete(shout.id)
    setError(null)
    try {
      await remove(ref(db, `shouts/${shout.id}`))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyDelete(null)
    }
  }

  if (shouts === null) return <Spinner />

  return (
    <>
      <PageHeader title="Mural" description="Recado rápido pra guild — sem formalidade de anúncio." />

      <ErrorNote message={error} />

      <Card className="mb-6 p-4">
        <form className="flex gap-2" onSubmit={(e) => void post(e)}>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={280}
            placeholder="Escreva um recado…"
            className="flex-1"
          />
          <Button type="submit" disabled={busy || !text.trim()} className="self-end">
            Postar
          </Button>
        </form>
      </Card>

      {sorted.length === 0 ? (
        <EmptyState title="Nenhum recado ainda" description="Seja o primeiro a escrever algo." />
      ) : (
        <ul className="space-y-2">
          {sorted.map((shout) => (
            <li key={shout.id}>
              <Card className="flex items-start gap-3 p-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300">
                  {shout.nick.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span
                      className={cx(
                        'text-sm font-medium',
                        shout.uid === member?.uid ? 'text-amber-400' : 'text-zinc-100',
                      )}
                    >
                      {shout.nick}
                    </span>
                    <span className="text-xs text-zinc-500">{formatDateTime(shout.createdAt)}</span>
                  </p>
                  <p className="mt-0.5 text-sm whitespace-pre-wrap text-zinc-300">{shout.text}</p>
                </div>
                {(isAdmin || shout.uid === member?.uid) && (
                  <button
                    type="button"
                    disabled={busyDelete === shout.id}
                    onClick={() => void del(shout)}
                    className="shrink-0 text-xs text-zinc-600 transition-colors hover:text-red-400 disabled:opacity-50"
                  >
                    apagar
                  </button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
