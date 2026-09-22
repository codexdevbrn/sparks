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

/**
 * Interesse de uma pessoa numa peça. Mais de uma pessoa pode querer a mesma
 * peça: elas formam uma fila, cuja ordem o admin define.
 */
export type Reservation = {
  /**
   * Sempre `${setId}__${slot}__${uid}`. A chave inclui o uid porque a peça
   * aceita vários interessados; o que ela impede é a mesma pessoa entrar duas
   * vezes na mesma fila.
   */
  id: string
  setId: string
  setName: string
  charClass: CharClass
  slot: SlotKey
  uid: string
  nick: string
  /**
   * Posição na fila da peça: menor vem primeiro. Nasce como `Date.now()`, o que
   * dá a ordem de chegada e deixa espaço de sobra entre os valores. Reordenar é
   * trocar esse número entre dois vizinhos — não renumera a fila inteira.
   */
  order: number
  createdAt?: number
}

/**
 * Registro de uma entrega: quem levou a peça de fato.
 *
 * A fila diz quem tem prioridade; isto diz quem recebeu. São coisas diferentes,
 * e a mesma pessoa pode receber a mesma peça mais de uma vez — por isso a chave
 * é gerada por `push`, e não determinística.
 */
export type Drop = {
  id: string
  setId: string
  setName: string
  charClass: CharClass
  slot: SlotKey
  /** Quem recebeu. */
  uid: string
  nick: string
  /** Qual admin registrou. */
  byUid: string
  byNick: string
  /** Quando foi registrado, em ms desde a epoch. */
  at: number
}

export type Announcement = {
  id: string
  title: string
  body: string
  /** Link já normalizado da imagem; vazio quando não há. */
  imageUrl: string
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

/** Chave determinística do interesse de uma pessoa numa peça. */
export function reservationId(setId: string, slot: SlotKey, uid: string): string {
  return `${setId}__${slot}__${uid}`
}

/** Identifica a fila de uma peça, sem a pessoa. */
export function queueKey(setId: string, slot: SlotKey): string {
  return `${setId}__${slot}`
}
