import { nextOccurrence } from './recurrence'
import type { GuildEvent } from '../types'

export type EventDate = {
  /** Chave no mapa `dates`, ou `'single'` para evento de data única antiga. */
  key: string
  at: number
}

/**
 * Datas de um evento, em ordem crescente.
 *
 * Três formatos convivem: `dates` (várias), `startsAt` (uma só, o formato
 * antigo) e `recurrence` (semanal, que não tem data fixa e devolve lista
 * vazia — quem chama trata recorrente à parte).
 */
export function eventDates(event: GuildEvent): EventDate[] {
  if (event.dates) {
    return Object.entries(event.dates)
      .map(([key, at]) => ({ key, at }))
      .sort((a, b) => a.at - b.at)
  }
  if (typeof event.startsAt === 'number') {
    return [{ key: 'single', at: event.startsAt }]
  }
  return []
}

/**
 * A data que interessa agora: a próxima que ainda não passou.
 *
 * Passadas todas, devolve a última — assim o evento ordena junto dos outros
 * que já aconteceram, em vez de saltar para o topo da agenda.
 */
export function nextEventDate(event: GuildEvent, now: number): EventDate | null {
  const dates = eventDates(event)
  if (dates.length === 0) return null
  return dates.find((d) => d.at >= now) ?? dates[dates.length - 1]
}

/** Data usada para ordenar e para decidir se um evento já passou. */
export function effectiveStartsAt(event: GuildEvent, now: number): number {
  if (event.recurrence) return nextOccurrence(event.recurrence, now)
  return nextEventDate(event, now)?.at ?? 0
}

/** Recorrente nunca passa. Com várias datas, só passa quando todas passaram. */
export function isEventPast(event: GuildEvent, now: number): boolean {
  if (event.recurrence) return false
  const dates = eventDates(event)
  if (dates.length === 0) return true
  return dates[dates.length - 1].at < now
}

/** Quantas datas ainda estão por vir. */
export function upcomingCount(event: GuildEvent, now: number): number {
  return eventDates(event).filter((d) => d.at >= now).length
}
