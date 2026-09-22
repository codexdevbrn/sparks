import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { onValue, ref, serverTimestamp, update } from 'firebase/database'
import { useAuth } from '../lib/auth'
import { db } from '../lib/firebase'
import { errorMessage, formatDateTime } from '../lib/format'
import { Button, Card, EmptyState, ErrorNote, PageHeader, Spinner, Textarea } from '../components/ui'
import type { GuildRules } from '../types'

/**
 * Um bloco de texto só, mantido pelo admin — regras de drop, código de
 * conduta, o que for. Não é uma lista de posts: é o "documento oficial" da
 * guild, por isso vive num nó único (`guildRules`), não num cadastro.
 */
export function Rules() {
  const { isAdmin } = useAuth()
  const [rules, setRules] = useState<GuildRules | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    return onValue(
      ref(db, 'guildRules'),
      (snap) => setRules(snap.val()),
      (err) => setError(errorMessage(err)),
    )
  }, [])

  if (rules === undefined) return <Spinner />

  return (
    <>
      <PageHeader
        title="Regras da guild"
        description="Drop, conduta, o combinado — pra não depender de lembrar o que foi dito uma vez no Discord."
        action={
          isAdmin &&
          !editing && <Button onClick={() => setEditing(true)}>{rules ? 'Editar' : 'Escrever'}</Button>
        }
      />

      <ErrorNote message={error} />

      {editing ? (
        <RulesForm rules={rules} onClose={() => setEditing(false)} />
      ) : rules?.body ? (
        <Card className="p-6">
          <p className="whitespace-pre-wrap text-sm text-zinc-200">{rules.body}</p>
          {rules.updatedAt && (
            <p className="mt-6 text-xs text-zinc-500">
              Atualizado por {rules.updatedBy} em {formatDateTime(rules.updatedAt)}
            </p>
          )}
        </Card>
      ) : (
        <EmptyState
          title="Ainda sem regras escritas"
          description={isAdmin ? undefined : 'A liderança ainda não publicou nada aqui.'}
        />
      )}
    </>
  )
}

function RulesForm({ rules, onClose }: { rules: GuildRules | null; onClose: () => void }) {
  const { member } = useAuth()
  const [body, setBody] = useState(rules?.body ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!member) return
    setBusy(true)
    setError(null)
    try {
      await update(ref(db, 'guildRules'), {
        body: body.trim(),
        updatedBy: member.nick,
        updatedAt: serverTimestamp(),
      })
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Card className="p-6">
      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={16}
          maxLength={8000}
          placeholder="Regras de drop, horários, condutas esperadas…"
          autoFocus
        />
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
    </Card>
  )
}
