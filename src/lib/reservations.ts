import { SLOTS } from '../types'
import type { Reservation } from '../types'

export type SetGroup = {
  setId: string
  setName: string
  charClass: string
  /** `true` quando o registro é uma coisa só, não um conjunto de peças. */
  single: boolean
  items: Reservation[]
}

/**
 * Agrupa reservas por set, com as peças em ordem canônica.
 *
 * Sem isso, sete reservas do mesmo set viram sete linhas repetindo o nome; e a
 * ordem de chegada das reservas não significa nada para quem lê.
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
