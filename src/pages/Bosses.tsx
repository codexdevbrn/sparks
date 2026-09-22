import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { onValue, push, ref, remove, serverTimestamp, update } from 'firebase/database'
import { useAuth } from '../lib/auth'
import { db } from '../lib/firebase'
import { errorMessage } from '../lib/format'
import {
  formatCountdownClock,
  isBossActive,
  lastBossSpawn,
  nextBossSpawn,
  WEEKDAY_LABELS,
} from '../lib/recurrence'
import { listFrom } from '../lib/rtdb'
import {
  notificationPermission,
  requestNotificationPermission,
  sendNotification,
} from '../lib/notify'
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
import type { Boss, BossSchedule, Weekday } from '../types'

const NO_SCHEDULE = Infinity
const ACTIVE_MINUTES = 15
const NOTIFY_OFFSETS_MIN = [15, 10]

/** Próximo nascimento entre todos os horários do boss, ou `NO_SCHEDULE` se não tem nenhum. */
function nextSpawn(boss: Boss, now: number): number {
  if (!boss.schedules || boss.schedules.length === 0) return NO_SCHEDULE
  return Math.min(...boss.schedules.map((s) => nextBossSpawn(s, now)))
}

function bossIsActive(boss: Boss, now: number): boolean {
  return (boss.schedules ?? []).some((s) => isBossActive(s, now, ACTIVE_MINUTES))
}

/**
 * Catálogo de bosses com N horários cada — diferente de Eventos, que é uma
 * agenda de um evento por vez. Aqui o boss é o registro, e os horários são
 * dele: um boss pode nascer várias vezes por dia, ou uma vez por semana.
 * Nem todo boss tem horário publicado — só local — e isso é normal.
 *
 * O relógio roda de segundo em segundo: é um cronômetro de verdade, porque
 * o horário de nascimento é exato (não uma estimativa).
 */
export function Bosses() {
  const { isAdmin } = useAuth()
  const [bosses, setBosses] = useState<Boss[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Boss | 'new' | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [permission, setPermission] = useState(notificationPermission())

  useEffect(() => {
    return onValue(
      ref(db, 'bosses'),
      (snap) => setBosses(listFrom<Boss>(snap.val())),
      (err) => setError(errorMessage(err)),
    )
  }, [])

  // Cronômetro de verdade: atualiza a cada segundo.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Aviso 15min e 10min antes de cada nascimento, enquanto a aba estiver
  // aberta — sem servidor não dá pra avisar com a aba fechada (ver lib/notify.ts).
  const notifiedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!bosses || permission !== 'granted') return
    const check = () => {
      const t = Date.now()
      for (const boss of bosses) {
        ;(boss.schedules ?? []).forEach((schedule, i) => {
          const next = nextBossSpawn(schedule, t)
          const remainingMin = (next - t) / 60_000
          for (const offset of NOTIFY_OFFSETS_MIN) {
            const key = `${boss.id}-${i}-${next}-${offset}`
            if (remainingMin <= offset && remainingMin > offset - 1 && !notifiedRef.current.has(key)) {
              notifiedRef.current.add(key)
              sendNotification(
                `${boss.name} nasce em ${offset}min`,
                boss.location ? `${boss.location.map} (${boss.location.x}/${boss.location.y})` : undefined,
              )
            }
          }
        })
      }
    }
    check()
    const id = setInterval(check, 15_000)
    return () => clearInterval(id)
  }, [bosses, permission])

  async function enableNotifications() {
    const result = await requestNotificationPermission()
    setPermission(result)
  }

  // Sempre por "nasce quando": o boss ativo (que acabou de nascer) some do
  // topo assim que outro estiver mais perto de nascer, porque a pergunta que
  // a lista responde é "qual eu vejo primeiro", não "qual tá ativo".
  const sorted = useMemo(() => {
    const withNext = (bosses ?? []).map((b) => ({
      boss: b,
      active: bossIsActive(b, now),
      next: nextSpawn(b, now),
    }))
    withNext.sort((a, b) => a.next - b.next || a.boss.name.localeCompare(b.boss.name))
    return withNext
  }, [bosses, now])

  async function handleDelete(boss: Boss) {
    if (!confirm(`Excluir "${boss.name}" do catálogo?`)) return
    try {
      await remove(ref(db, `bosses/${boss.id}`))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (bosses === null) return <Spinner />

  return (
    <>
      <PageHeader
        title="Bosses"
        description="Catálogo de bosses com local e horário de nascimento — pra saber onde ir e o que droppa."
        action={
          <div className="flex flex-wrap gap-2">
            {permission !== 'unsupported' && permission !== 'granted' && (
              <Button variant="secondary" size="sm" onClick={() => void enableNotifications()}>
                🔔 Avisar 15min antes
              </Button>
            )}
            {isAdmin && <Button onClick={() => setEditing('new')}>Novo boss</Button>}
          </div>
        }
      />

      <ErrorNote message={error} />

      {permission === 'granted' && (
        <p className="mb-4 text-xs text-zinc-500">
          🔔 Notificações ligadas — avisa 15min e 10min antes de cada nascimento, enquanto esta aba
          estiver aberta.
        </p>
      )}
      {permission === 'denied' && (
        <p className="mb-4 text-xs text-zinc-500">
          Notificação bloqueada pelo navegador. Pra ligar, libere nas permissões do site.
        </p>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          title="Nenhum boss cadastrado"
          description={isAdmin ? 'Cadastre o primeiro, com local e horário (se souber).' : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sorted.map(({ boss, active }) => (
            <BossCard
              key={boss.id}
              boss={boss}
              now={now}
              active={active}
              isAdmin={isAdmin}
              onEdit={() => setEditing(boss)}
              onDelete={() => void handleDelete(boss)}
            />
          ))}
        </div>
      )}

      {editing && (
        <BossForm
          key={editing === 'new' ? 'new' : editing.id}
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function scheduleLabel(schedule: BossSchedule): string {
  const time = `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`
  if (schedule.weekday === undefined) return `Todo dia às ${time}`
  return `Toda ${WEEKDAY_LABELS[schedule.weekday]} às ${time}`
}

function BossCard({
  boss,
  now,
  active,
  isAdmin,
  onEdit,
  onDelete,
}: {
  boss: Boss
  now: number
  active: boolean
  isAdmin: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const rows = (boss.schedules ?? [])
    .map((s, i) => ({
      key: i,
      schedule: s,
      active: isBossActive(s, now, ACTIVE_MINUTES),
      next: nextBossSpawn(s, now),
      activeUntil: lastBossSpawn(s, now) + ACTIVE_MINUTES * 60_000,
    }))
    .sort((a, b) => a.next - b.next)

  return (
    <Card className={cx('p-5', active && 'border-emerald-500/50 bg-emerald-500/5')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {active && <Badge tone="green">🟢 Ativo</Badge>}
            <h2 className="text-base font-semibold text-zinc-50">{boss.name}</h2>
          </div>
          {boss.location && (
            <p className="mt-0.5 text-xs text-zinc-500">
              📍 {boss.location.map} ({boss.location.x}/{boss.location.y})
            </p>
          )}
        </div>
        {isAdmin && (
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Editar
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              Excluir
            </Button>
          </div>
        )}
      </div>

      {boss.notes && <p className="mt-2 text-sm whitespace-pre-wrap text-zinc-300">{boss.notes}</p>}

      {(rows.length > 0 || boss.scheduleNote) && (
        <div className="mt-4 space-y-1.5 border-t border-zinc-800 pt-4">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-zinc-400">{scheduleLabel(row.schedule)}</span>
              {row.active ? (
                <span className="shrink-0 font-mono font-medium text-emerald-400">
                  ativo · some em {formatCountdownClock(row.activeUntil, now)}
                </span>
              ) : (
                <span className="shrink-0 font-mono font-medium text-amber-400">
                  {formatCountdownClock(row.next, now)}
                </span>
              )}
            </div>
          ))}
          {boss.scheduleNote && <p className="text-xs text-zinc-500">{boss.scheduleNote}</p>}
        </div>
      )}
    </Card>
  )
}

/* ---------------- formulário ---------------- */

const WEEKDAY_OPTIONS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

type ScheduleRow = { daily: boolean; weekday: Weekday; time: string }

function toScheduleRow(schedule: BossSchedule): ScheduleRow {
  return {
    daily: schedule.weekday === undefined,
    weekday: schedule.weekday ?? 0,
    time: `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`,
  }
}

function BossForm({ item, onClose }: { item: Boss | null; onClose: () => void }) {
  const { member } = useAuth()
  const [name, setName] = useState(item?.name ?? '')
  const [map, setMap] = useState(item?.location?.map ?? '')
  const [x, setX] = useState(item?.location ? String(item.location.x) : '')
  const [y, setY] = useState(item?.location ? String(item.location.y) : '')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [scheduleNote, setScheduleNote] = useState(item?.scheduleNote ?? '')
  const [rows, setRows] = useState<ScheduleRow[]>((item?.schedules ?? []).map(toScheduleRow))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function updateRow(i: number, patch: Partial<ScheduleRow>) {
    setRows((current) => current.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows((current) => [...current, { daily: true, weekday: 0, time: '00:00' }])
  }

  function removeRow(i: number) {
    setRows((current) => current.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!member) return

    if (!name.trim()) {
      setError('Informe o nome do boss.')
      return
    }

    const schedules: BossSchedule[] = []
    for (const row of rows) {
      const [hourStr, minuteStr] = row.time.split(':')
      const hour = Number(hourStr)
      const minute = Number(minuteStr)
      if (Number.isNaN(hour) || Number.isNaN(minute)) {
        setError('Um dos horários está inválido.')
        return
      }
      schedules.push(row.daily ? { hour, minute } : { weekday: row.weekday, hour, minute })
    }

    let location = null
    if (map.trim()) {
      const xNum = Number(x)
      const yNum = Number(y)
      if (Number.isNaN(xNum) || Number.isNaN(yNum)) {
        setError('Coordenada inválida — X e Y são números.')
        return
      }
      location = { map: map.trim(), x: xNum, y: yNum }
    }

    setBusy(true)
    setError(null)
    try {
      const payload = {
        name: name.trim(),
        location,
        notes: notes.trim(),
        scheduleNote: scheduleNote.trim(),
        schedules,
      }
      if (item) {
        await update(ref(db, `bosses/${item.id}`), payload)
      } else {
        await push(ref(db, 'bosses'), {
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
    <Modal open title={item ? 'Editar boss' : 'Novo boss'} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus />
        </Field>

        <Field label="Local" hint="Mapa e coordenada. Opcional, mas ajuda a achar o boss.">
          <div className="flex gap-2">
            <Input
              value={map}
              onChange={(e) => setMap(e.target.value)}
              placeholder="Mapa (ex.: Lorencia)"
              maxLength={40}
              className="flex-1"
            />
            <Input
              value={x}
              onChange={(e) => setX(e.target.value)}
              placeholder="X"
              inputMode="numeric"
              className="w-16"
            />
            <Input
              value={y}
              onChange={(e) => setY(e.target.value)}
              placeholder="Y"
              inputMode="numeric"
              className="w-16"
            />
          </div>
        </Field>

        <Field label="Horários fixos" hint="Deixe sem nenhum se o boss não tem horário publicado.">
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 p-2">
                <Select
                  className="w-auto flex-1"
                  value={row.daily ? 'daily' : row.weekday}
                  onChange={(e) =>
                    updateRow(i, {
                      daily: e.target.value === 'daily',
                      weekday: e.target.value === 'daily' ? row.weekday : (Number(e.target.value) as Weekday),
                    })
                  }
                >
                  <option value="daily">Todo dia</option>
                  {WEEKDAY_OPTIONS.map((w) => (
                    <option key={w} value={w}>
                      Toda {WEEKDAY_LABELS[w]}
                    </option>
                  ))}
                </Select>
                <Input
                  type="time"
                  className="w-auto"
                  value={row.time}
                  onChange={(e) => updateRow(i, { time: e.target.value })}
                  required
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(i)}>
                  ✕
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={addRow}>
              + Adicionar horário
            </Button>
          </div>
        </Field>

        <Field
          label="Cadência (se não tem horário fixo)"
          hint='Ex.: "1x por dia", "posição aleatória", "só pra guild dona do castelo".'
        >
          <Input value={scheduleNote} onChange={(e) => setScheduleNote(e.target.value)} maxLength={100} />
        </Field>

        <Field label="Observações" hint="Opcional — o que dropa, dica de rota, etc.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500} />
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
