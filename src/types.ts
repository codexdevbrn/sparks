/* ---------------- cargos ---------------- */

export type Role = 'pending' | 'member' | 'admin'

export const ROLE_LABELS: Record<Role, string> = {
  pending: 'Pendente',
  member: 'Membro',
  admin: 'Admin',
}

/* ---------------- classes ---------------- */

export const CHAR_CLASSES = [
  'Dark Knight',
  'Dark Wizard',
  'Elf',
  'Magic Gladiator',
  'Dark Lord',
  'Summoner',
  'Rage Fighter',
  'Comum',
] as const

export type CharClass = (typeof CHAR_CLASSES)[number]

/* ---------------- peças de set ---------------- */

export const SLOTS = [
  'helm',
  'armor',
  'pants',
  'gloves',
  'boots',
  'weapon',
  'shield',
  // Usado quando o registro nao e um conjunto, e sim uma coisa so: uma arma,
  // uma asa, uma joia, um pet. Uma peca, uma reserva.
  'item',
] as const

export type SlotKey = (typeof SLOTS)[number]

export const SLOT_LABELS: Record<SlotKey, string> = {
  helm: 'Elmo',
  armor: 'Armadura',
  pants: 'Calça',
  gloves: 'Luvas',
  boots: 'Botas',
  weapon: 'Arma',
  shield: 'Escudo',
  item: 'Item',
}

/** Peças que o admin pode marcar ao montar um conjunto. */
export const PIECE_SLOTS: SlotKey[] = [
  'helm',
  'armor',
  'pants',
  'gloves',
  'boots',
  'weapon',
  'shield',
]

/**
 * No RTDB não se guarda array: ele viraria um objeto de chaves numéricas e
 * abriria espaço para buracos e reordenação. As peças são um mapa de flags.
 */
export type SlotMap = Partial<Record<SlotKey, true>>

export const DEFAULT_SLOTS: SlotMap = {
  helm: true,
  armor: true,
  pants: true,
  gloves: true,
  boots: true,
}

/** Composição de um registro que é uma coisa só, não um conjunto. */
export const SINGLE_SLOTS: SlotMap = { item: true }

/**
 * `true` quando o registro é uma coisa só (arma, asa, jóia) e não um conjunto.
 * Derivado da composição — não precisa de campo próprio no banco.
 */
export function isSingleItem(slots: SlotMap | undefined): boolean {
  return slots?.item === true
}

/** Devolve as peças do set na ordem canônica de `SLOTS`. */
export function slotList(slots: SlotMap | undefined): SlotKey[] {
  if (!slots) return []
  return SLOTS.filter((slot) => slots[slot])
}

export function slotMapFrom(list: SlotKey[]): SlotMap {
  const map: SlotMap = {}
  for (const slot of list) map[slot] = true
  return map
}

/* ---------------- nós ---------------- */
/* Datas são milissegundos desde a epoch — é o que `serverTimestamp()` do
   RTDB resolve, e o que volta na leitura. */

export type Member = {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  nick: string
  charClass: CharClass | ''
  role: Role
  createdAt?: number
  updatedAt?: number
}

export type GuildSet = {
  id: string
  name: string
  charClass: CharClass
  /** Livre de propósito: "Normal", "Excellent", "Ancient", "+13", etc. */
  tier: string
  slots: SlotMap
  notes: string
  createdAt?: number
}

export type Reservation = {
  /** Sempre `${setId}__${slot}` — é o que garante a exclusividade. */
  id: string
  setId: string
  setName: string
  charClass: CharClass
  slot: SlotKey
  uid: string
  nick: string
  createdAt?: number
}

export type Announcement = {
  id: string
  title: string
  body: string
  pinned: boolean
  authorUid: string
  authorName: string
  createdAt?: number
  updatedAt?: number
}

export const EVENT_TYPES = ['Castle Siege', 'Blood Castle', 'Chaos Castle', 'Boss', 'Outro'] as const

export type EventType = (typeof EVENT_TYPES)[number]

export type GuildEvent = {
  id: string
  title: string
  description: string
  type: EventType
  /** Milissegundos desde a epoch. */
  startsAt: number
  createdBy: string
  createdByName: string
  createdAt?: number
}

export type RsvpStatus = 'going' | 'maybe' | 'out'

export const RSVP_LABELS: Record<RsvpStatus, string> = {
  going: 'Vou',
  maybe: 'Talvez',
  out: 'Não vou',
}

export type Rsvp = {
  uid: string
  nick: string
  status: RsvpStatus
  updatedAt?: number
}

/** Chave determinística de uma reserva. */
export function reservationId(setId: string, slot: SlotKey): string {
  return `${setId}__${slot}`
}
