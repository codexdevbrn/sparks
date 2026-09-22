import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, serverTimestamp, update } from 'firebase/database'
import { useAuth } from '../lib/auth'
import { db } from '../lib/firebase'
import { errorMessage } from '../lib/format'
import { MyReservations } from '../components/MyReservations'
import { Badge, Button, Card, ErrorNote, Field, Input, PageHeader, Select } from '../components/ui'
import { CHAR_CLASSES, ROLE_LABELS } from '../types'
import type { CharClass } from '../types'

export function Profile() {
  const { user, member } = useAuth()
  const navigate = useNavigate()
  const [nick, setNick] = useState('')
  const [charClass, setCharClass] = useState<CharClass | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Sincroniza o formulário quando o documento do membro chega/muda.
  useEffect(() => {
    if (!member) return
    setNick(member.nick)
    setCharClass(member.charClass)
  }, [member])

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (!member) return

    const nickTrim = nick.trim()
    if (!nickTrim) {
      setError('O nick é obrigatório.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await update(ref(db, `members/${member.uid}`), {
        nick: nickTrim,
        charClass,
        displayName: user?.displayName ?? null,
        photoURL: user?.photoURL ?? null,
        updatedAt: serverTimestamp(),
      })
      // `replace` para que o botão Voltar não devolva ao formulário — importa
      // no primeiro acesso, em que o RequireAuth trouxe o usuário para cá.
      navigate('/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Meu perfil" description="Como você aparece para o resto da guild." />

      {!member?.nick && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          Defina seu nick antes de continuar — é ele que identifica suas reservas de set.
        </p>
      )}

      <Card className="p-6">
        <div className="mb-6 flex items-center gap-3 border-b border-zinc-800 pb-4">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="" className="size-10 rounded-full" />
          ) : (
            <span className="grid size-10 place-items-center rounded-full bg-zinc-800 text-sm">?</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-zinc-200">{user?.displayName || 'Sem nome'}</p>
            <p className="truncate text-xs text-zinc-500">{user?.email}</p>
          </div>
          {member && <Badge tone={member.role === 'admin' ? 'amber' : 'green'}>{ROLE_LABELS[member.role]}</Badge>}
        </div>

        <form className="space-y-4" onSubmit={(e) => void handleSave(e)}>
          <Field label="Nick no jogo" hint="Nome do personagem que a guild conhece.">
            <Input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} required />
          </Field>

          <Field label="Classe">
            <Select value={charClass} onChange={(e) => setCharClass(e.target.value as CharClass | '')}>
              <option value="">Selecione…</option>
              {CHAR_CLASSES.filter((c) => c !== 'Comum').map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          <ErrorNote message={error} />

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Card>

      {/* Só depois do nick: sem nick o usuário não conseguiu reservar nada ainda. */}
      {member?.nick && (
        <div className="mt-10">
          <MyReservations uid={member.uid} />
        </div>
      )}
    </div>
  )
}
