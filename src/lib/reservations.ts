import { SLOTS, queueKey } from '../types'
import type { Drop, Reservation } from '../types'

export type SetGroup = {
  setId: string
  setName: string
  charClass: string
  /** `true` quando o registro é uma coisa só, não um conjunto de peças. */
  single: boolean
  items: Reservation[]
}

/**
 * Ordem da fila: `order` manda, e os desempates existem só para a lista nunca
 * embaralhar entre renderizações — dois interessados podem nascer com o mesmo
 * `Date.now()` se clicarem no mesmo milissegundo.
 */
export function byQueueOrder(a: Reservation, b: Reservation): number {
  return (
    a.order - b.order ||
    (a.createdAt ?? 0) - (b.createdAt ?? 0) ||
    a.nick.localeCompare(b.nick) ||
    a.uid.localeCompare(b.uid)
  )
}

/** Indexa as filas por peça, cada uma já ordenada. */
export function buildQueues(list: Reservation[]): Map<string, Reservation[]> {
  const queues = new Map<string, Reservation[]>()

  for (const res of list) {
    const key = queueKey(res.setId, res.slot)
    const queue = queues.get(key) ?? []
    queue.push(res)
    queues.set(key, queue)
  }

  for (const queue of queues.values()) queue.sort(byQueueOrder)
  return queues
}

/** Posição de alguém na fila da própria peça, começando em 1. `0` se não está. */
export function positionIn(queue: Reservation[] | undefined, uid: string): number {
  if (!queue) return 0
  return queue.findIndex((r) => r.uid === uid) + 1
}

export type SetProgress = {
  setId: string
  setName: string
  charClass: string
  single: boolean
  /** Peças que a pessoa ainda espera receber. */
  pending: Reservation[]
  /** Peças que já foram entregues a ela. */
  delivered: Drop[]
}

/**
 * Progresso de um player por set: o que já recebeu e o que falta.
 *
 * Um set é entregue aos poucos, e a peça entregue some da fila — então o que
 * falta vive em `reservations` e o que saiu vive em `drops`. Nenhum dos dois
 * sozinho conta a história.
 */
export function progressFor(uid: string, reservations: Reservation[], drops: Drop[]): SetProgress[] {
  const bySet = new Map<string, SetProgress>()

  const ensure = (setId: string, setName: string, charClass: string) => {
    const current = bySet.get(setId) ?? {
      setId,
      setName,
      charClass,
      single: false,
      pending: [],
      delivered: [],
    }
    bySet.set(setId, current)
    return current
  }

  for (const res of reservations) {
    if (res.uid !== uid) continue
    const entry = ensure(res.setId, res.setName, res.charClass)
    entry.pending.push(res)
    if (res.slot === 'item') entry.single = true
  }

  for (const drop of drops) {
    if (drop.uid !== uid) continue
    const entry = ensure(drop.setId, drop.setName, drop.charClass)
    entry.delivered.push(drop)
    if (drop.slot === 'item') entry.single = true
  }

  for (const entry of bySet.values()) {
    entry.pending.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot))
    entry.delivered.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot))
  }

  return [...bySet.values()].sort((a, b) => {
    // Set incompleto primeiro: é nele que o admin ainda tem trabalho.
    const aDone = a.pending.length === 0
    const bDone = b.pending.length === 0
    if (aDone !== bDone) return aDone ? 1 : -1
    return a.setName.localeCompare(b.setName)
  })
}

/**
 * Agrupa interesses por set, com as peças em ordem canônica.
 *
 * Sem isso, sete linhas do mesmo set repetem o nome; e a ordem de chegada dos
 * interesses não significa nada para quem lê.
 */
export function groupBySet(list: Reservation[]): SetGroup[] {
  const bySet = new Map<string, SetGroup>()

  for (const res of list) {
    const group = bySet.get(res.setId) ?? {
      setId: res.setId,
      setName: res.setName,
      charClass: res.charClass,
      single: false,
      items: [],
    }
    group.items.push(res)
    if (res.slot === 'item') group.single = true
    bySet.set(res.setId, group)
  }

  for (const group of bySet.values()) {
    group.items.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot))
  }

  return [...bySet.values()].sort((a, b) => a.setName.localeCompare(b.setName))
}
