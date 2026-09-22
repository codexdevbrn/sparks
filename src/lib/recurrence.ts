import type { BossSchedule, Recurrence } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

export const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/** Próxima ocorrência (>= `from`) de um evento recorrente, no fuso do navegador. */
export function nextOccurrence(recurrence: Recurrence, from = Date.now()): number {
  const d = new Date(from)
  d.setHours(recurrence.hour, recurrence.minute, 0, 0)
  d.setDate(d.getDate() + ((recurrence.weekday - d.getDay() + 7) % 7))
  if (d.getTime() < from) d.setTime(d.getTime() + WEEK_MS)
  return d.getTime()
}

/**
 * Próximo nascimento (>= `from`) de um horário de boss. Sem `weekday` é
 * todo dia, no mesmo horário; com `weekday`, uma vez por semana — igual
 * `nextOccurrence`, só que o dia é opcional.
 */
export function nextBossSpawn(schedule: BossSchedule, from = Date.now()): number {
  const d = new Date(from)
  d.setHours(schedule.hour, schedule.minute, 0, 0)

  if (schedule.weekday === undefined) {
    if (d.getTime() < from) d.setTime(d.getTime() + DAY_MS)
    return d.getTime()
  }

  d.setDate(d.getDate() + ((schedule.weekday - d.getDay() + 7) % 7))
  if (d.getTime() < from) d.setTime(d.getTime() + WEEK_MS)
  return d.getTime()
}

/** "nasce em 3h12min", "nasce em 45min" — versão em minutos, pra listas. */
export function formatCountdown(targetMs: number, from = Date.now()): string {
  const diff = Math.max(0, targetMs - from)
  const totalMin = Math.round(diff / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}min`
}

/** "1:03:42" ou "03:42" — cronômetro regressivo de verdade, com segundos. */
export function formatCountdownClock(targetMs: number, from = Date.now()): string {
  const diff = Math.max(0, targetMs - from)
  const totalSec = Math.floor(diff / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/**
 * Último nascimento (<= `from`) de um horário de boss — o espelho de
 * `nextBossSpawn`. É o que permite saber se o boss ainda está no mapa: se o
 * último nascimento foi há menos de `activeMinutes`, ele está ativo.
 */
export function lastBossSpawn(schedule: BossSchedule, from = Date.now()): number {
  const next = nextBossSpawn(schedule, from)
  if (next === from) return next
  const period = schedule.weekday === undefined ? DAY_MS : WEEK_MS
  return next - period
}

/**
 * Um boss nasce e fica no mapa por um tempo antes de sumir (ou ser morto).
 * Sem um evento real de "morreu", a guild convencionou 15 minutos como o
 * tempo que ele costuma durar — é uma aproximação, não uma certeza, mas dá
 * o "provavelmente ainda tá lá" que a lista precisa.
 */
export function isBossActive(schedule: BossSchedule, from = Date.now(), activeMinutes = 15): boolean {
  return from - lastBossSpawn(schedule, from) <= activeMinutes * 60_000
}

/**
 * Identifica o ciclo de confirmação atual de um evento recorrente.
 *
 * Não existe cron no projeto (só Hosting + RTDB, sem Cloud Functions), então o
 * reset não é um job que roda às 16:00 — é a própria chave que muda sozinha
 * nesse instante. Antes do reset, o ciclo é a semana anterior; depois, a
 * semana atual. Confirmações antigas ficam no banco sob a chave velha, só não
 * aparecem mais na tela.
 */
export function rsvpCycleId(recurrence: Recurrence, from = Date.now(), resetBeforeMinutes = 60): string {
  const occurrence = nextOccurrence(recurrence, from)
  const resetAt = occurrence - resetBeforeMinutes * 60 * 1000
  const boundary = resetAt <= from ? resetAt : resetAt - WEEK_MS
  return String(boundary)
}
