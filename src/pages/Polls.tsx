import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { onValue, push, ref, serverTimestamp, set, update } from 'firebase/database'
import { useAuth } from '../lib/auth'
import { db } from '../lib/firebase'
import { errorMessage, formatDateTime } from '../lib/format'
import { listFrom } from '../lib/rtdb'
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner,
  cx,
} from '../components/ui'
import type { Poll, PollVote } from '../types'

/** Excluir a enquete remove também os votos, que vivem fora dela. */
export async function deletePollCascade(id: string): Promise<void> {
  await update(ref(db), { [`polls/${id}`]: null, [`pollVotes/${id}`]: null })
}

/**
 * Enquete simples: pergunta, opções, um voto por pessoa, sem trocar depois
 * (a regra do banco recusa sobrescrever um voto existente). Resultado
 * aparece em barra de porcentagem — visível pra todo mundo, votado ou não,
 * porque esconder o resultado de quem já votou não muda nada aqui.
 */
export function Polls() {
  const { isAdmin } = useAuth()
  const [polls, setPolls] = useState<Poll[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    return onValue(
      ref(db, 'polls'),
      (snap) => setPolls(listFrom<Poll>(snap.val())),
      (err) => setError(errorMessage(err)),
    )
  }, [])

  const sorted = useMemo(
    () => [...(polls ?? [])].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [polls],
  )

  async function handleDelete(poll: Poll) {
    if (!confirm(`Excluir a enquete "${poll.question}"?`)) return
    try {
      await deletePollCascade(poll.id)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (polls === null) return <Spinner />

  return (
    <>
      <PageHeader
        title="Enquetes"
        description="Decisão rápida da guild, com resultado à vista de todo mundo."
        action={isAdmin && <Button onClick={() => setCreating(true)}>Nova enquete</Button>}
      />

      <ErrorNote message={error} />

      {sorted.length === 0 ? (
        <EmptyState
          title="Nenhuma enquete ainda"
          description={isAdmin ? 'Crie uma pra decidir algo com a guild.' : undefined}
        />
      ) : (
        <div className="space-y-4">
          {sorted.map((poll) => (
            <PollCard key={poll.id} poll={poll} isAdmin={isAdmin} onDelete={() => void handleDelete(poll)} />
          ))}
        </div>
      )}

      {creating && <PollForm onClose={() => setCreating(false)} />}
    </>
  )
}

export function PollCard({ poll, isAdmin, onDelete }: { poll: Poll; isAdmin: boolean; onDelete: () => void }) {
  const { member } = useAuth()
  const [votes, setVotes] = useState<PollVote[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    return onValue(
      ref(db, `pollVotes/${poll.id}`),
      (snap) => setVotes(listFrom<PollVote>(snap.val(), 'uid')),
      (err) => setError(errorMessage(err)),
    )
  }, [poll.id])

  const closed = Boolean(poll.closesAt && poll.closesAt < Date.now())
  const mine = votes.find((v) => v.uid === member?.uid)
  const total = votes.length

  const counts = poll.options.map(
    (_, i) => votes.filter((v) => v.optionIndex === i).length,
  )

  async function vote(optionIndex: number) {
    if (!member || mine || closed) return
    setBusy(true)
    setError(null)
    try {
      await set(ref(db, `pollVotes/${poll.id}/${member.uid}`), {
        uid: member.uid,
        nick: member.nick,
        optionIndex,
        votedAt: serverTimestamp(),
      })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-50">{poll.question}</h2>
        {isAdmin && (
          <Button variant="ghost" size="sm" onClick={onDelete}>
            Excluir
          </Button>
        )}
      </div>

      <p className="mt-1 text-xs text-zinc-500">
        {total} voto(s) {closed && '· encerrada'}
        {!closed && poll.closesAt && ` · fecha em ${formatDateTime(poll.closesAt)}`}
      </p>

      <div className="mt-4 space-y-2">
        {poll.options.map((option, i) => {
          const pct = total > 0 ? Math.round((counts[i] / total) * 100) : 0
          const isMine = mine?.optionIndex === i
          const showResult = Boolean(mine) || closed

          return (
            <button
              key={i}
              type="button"
              disabled={busy || Boolean(mine) || closed}
              onClick={() => void vote(i)}
              className={cx(
                'relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                isMine ? 'border-amber-500/50' : 'border-zinc-700',
                !mine && !closed && 'hover:border-zinc-500',
                (mine || closed) && 'cursor-default',
              )}
            >
              {showResult && (
                <span
                  className="absolute inset-y-0 left-0 bg-amber-500/15"
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex items-center justify-between gap-2">
                <span className={cx('truncate', isMine ? 'text-amber-400' : 'text-zinc-200')}>
                  {option}
                  {isMine && ' · seu voto'}
                </span>
                {showResult && (
                  <span className="shrink-0 text-xs text-zinc-500">
                    {counts[i]} · {pct}%
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-2">
        <ErrorNote message={error} />
      </div>
    </Card>
  )
}

export function PollForm({ onClose }: { onClose: () => void }) {
  const { member } = useAuth()
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [hasDeadline, setHasDeadline] = useState(false)
  const [closesAt, setClosesAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function updateOption(i: number, value: string) {
    setOptions((current) => current.map((o, idx) => (idx === i ? value : o)))
  }

  function addOption() {
    if (options.length >= 8) return
    setOptions((current) => [...current, ''])
  }

  function removeOption(i: number) {
    setOptions((current) => current.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!member) return

    const cleanOptions = options.map((o) => o.trim()).filter(Boolean)
    if (!question.trim() || cleanOptions.length < 2) {
      setError('Escreva a pergunta e pelo menos 2 opções.')
      return
    }

    let closesAtMs: number | null = null
    if (hasDeadline) {
      const ms = new Date(closesAt).getTime()
      if (Number.isNaN(ms)) {
        setError('Informe um prazo válido, ou desmarque "com prazo".')
        return
      }
      closesAtMs = ms
    }

    setBusy(true)
    setError(null)
    try {
      await push(ref(db, 'polls'), {
        question: question.trim(),
        options: cleanOptions,
        closesAt: closesAtMs,
        createdBy: member.uid,
        createdByName: member.nick,
        createdAt: serverTimestamp(),
      })
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal open title="Nova enquete" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        <Field label="Pergunta">
          <Input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={200} required autoFocus />
        </Field>

        <Field label="Opções">
          <div className="space-y-2">
            {options.map((option, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={option}
                  onChange={(e) => updateOption(i, e.target.value)}
                  maxLength={80}
                  placeholder={`Opção ${i + 1}`}
                />
                {options.length > 2 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeOption(i)}>
                    ✕
                  </Button>
                )}
              </div>
            ))}
            {options.length < 8 && (
              <Button type="button" variant="secondary" size="sm" onClick={addOption}>
                + Adicionar opção
              </Button>
            )}
          </div>
        </Field>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={hasDeadline}
            onChange={(e) => setHasDeadline(e.target.checked)}
            className="size-4 accent-amber-500"
          />
          Com prazo pra fechar
        </label>

        {hasDeadline && (
          <Field label="Fecha em">
            <Input
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              required
            />
          </Field>
        )}

        <ErrorNote message={error} />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Criando…' : 'Criar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
