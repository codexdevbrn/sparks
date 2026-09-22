import { useState } from 'react'
import type { FormEvent } from 'react'
import { push, ref, serverTimestamp, update } from 'firebase/database'
import { db } from '../lib/firebase'
import { errorMessage } from '../lib/format'
import { SlotIcon } from './icons'
import { Button, ErrorNote, Field, Input, Modal, Select, Textarea, cx } from './ui'
import {
  CHAR_CLASSES,
  DEFAULT_SLOTS,
  ITEM_TYPES,
  PIECE_SLOTS,
  SINGLE_SLOTS,
  SLOT_LABELS,
  isSingleItem,
  slotList,
  slotMapFrom,
} from '../types'
import type { CharClass, GuildSet, ItemType, SlotKey } from '../types'

type Kind = 'set' | 'single'

/**
 * Cadastro de qualquer coisa dropável, em dois formatos:
 *
 * - `set`    — conjunto com N peças, cada peça reservável em separado.
 * - `single` — uma coisa só (arma, asa, jóia, pet): uma reserva e pronto.
 *
 * O formato não é um campo no banco: é derivado da composição de peças, em que
 * `{ item: true }` significa "coisa só". Assim as regras não precisam mudar.
 */
export function SetForm({ item, onClose }: { item: GuildSet | null; onClose: () => void }) {
  const editingSingle = item ? isSingleItem(item.slots) : false

  const [kind, setKind] = useState<Kind>(editingSingle ? 'single' : 'set')
  const [name, setName] = useState(item?.name ?? '')
  const [charClass, setCharClass] = useState<CharClass>(item?.charClass ?? 'Dark Knight')
  const [tier, setTier] = useState(item?.tier ?? 'Normal')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [pieces, setPieces] = useState<SlotKey[]>(
    slotList(editingSingle ? DEFAULT_SLOTS : (item?.slots ?? DEFAULT_SLOTS)),
  )
  const [itemType, setItemType] = useState<ItemType>(item?.itemType ?? 'Arma')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function togglePiece(slot: SlotKey) {
    setPieces((current) =>
      current.includes(slot)
        ? current.filter((s) => s !== slot)
        : PIECE_SLOTS.filter((s) => s === slot || current.includes(s)),
    )
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (kind === 'set' && pieces.length === 0) {
      setError('Selecione pelo menos uma peça, ou mude para item único.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const payload = {
        name: name.trim(),
        charClass,
        tier: tier.trim(),
        notes: notes.trim(),
        slots: kind === 'single' ? SINGLE_SLOTS : slotMapFrom(pieces),
        itemType: kind === 'single' ? itemType : null,
      }
      if (item) {
        // `update` substitui o valor de cada chave passada, então `slots` troca
        // por inteiro — peças desmarcadas não sobrevivem.
        await update(ref(db, `sets/${item.id}`), payload)
      } else {
        await push(ref(db, 'sets'), { ...payload, createdAt: serverTimestamp() })
      }
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal open title={item ? 'Editar cadastro' : 'Novo cadastro'} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        <Field label="Nome" hint="Set, arma, asa, jóia — o que for.">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Dragon Set, Excellent Sword of Fire"
            maxLength={60}
            required
            autoFocus
          />
        </Field>

        <Field label="Formato">
          <div className="grid gap-2 pt-1 sm:grid-cols-2">
            <KindOption
              checked={kind === 'set'}
              onSelect={() => setKind('set')}
              title="Conjunto"
              description="Cada peça é reservada em separado."
            />
            <KindOption
              checked={kind === 'single'}
              onSelect={() => setKind('single')}
              title="Item único"
              description="Uma reserva só. Arma, asa, jóia, pet."
            />
          </div>
        </Field>

        {kind === 'set' ? (
          <Field label="Peças reserváveis">
            <div className="flex flex-wrap gap-2 pt-1">
              {PIECE_SLOTS.map((slot) => (
                <label
                  key={slot}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300"
                >
                  <input
                    type="checkbox"
                    checked={pieces.includes(slot)}
                    onChange={() => togglePiece(slot)}
                    className="size-3.5 accent-amber-500"
                  />
                  <SlotIcon slot={slot} className="size-3.5 shrink-0" />
                  {SLOT_LABELS[slot]}
                </label>
              ))}
            </div>
          </Field>
        ) : (
          <Field label="Tipo do item">
            <Select value={itemType} onChange={(e) => setItemType(e.target.value as ItemType)}>
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Classe">
          <Select value={charClass} onChange={(e) => setCharClass(e.target.value as CharClass)}>
            {CHAR_CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Tier" hint="Ex.: Normal, Excellent, Ancient, +13. Pode deixar vazio.">
          <Input value={tier} onChange={(e) => setTier(e.target.value)} maxLength={30} />
        </Field>

        <Field label="Observações">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={300} />
        </Field>

        {item && (
          <p className="text-xs text-amber-400/80">
            Trocar o formato ou desmarcar uma peça esconde as reservas dela, que continuam salvas.
            Exclua o cadastro para limpá-las de vez.
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

function KindOption({
  checked,
  onSelect,
  title,
  description,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  description: string
}) {
  return (
    <label
      className={cx(
        'cursor-pointer rounded-lg border px-3 py-2 transition-colors',
        checked ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-700 hover:border-zinc-600',
      )}
    >
      <span className="flex items-center gap-2">
        <input
          type="radio"
          checked={checked}
          onChange={onSelect}
          className="size-3.5 accent-amber-500"
        />
        <span className="text-sm font-medium text-zinc-100">{title}</span>
      </span>
      <span className="mt-0.5 block pl-6 text-xs text-zinc-500">{description}</span>
    </label>
  )
}
