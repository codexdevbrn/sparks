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

/**
 * Categoria de um item único (`slots: { item: true }`). Não existe para
 * conjunto — um set já se identifica pelas peças. Cobre tudo que um player
 * pode pedir para dropar fora de um conjunto, jóia inclusive.
 */
export const ITEM_TYPES = [
  'Arma',
  'Escudo',
  'Asa',
  'Anel',
  'Amuleto',
  'Capa',
  'Pet',
  'Joia',
  'Poção',
  'Outro',
] as const

export type ItemType = (typeof ITEM_TYPES)[number]

export type GuildSet = {
  id: string
  name: string
  charClass: CharClass
  /** Livre de propósito: "Normal", "Excellent", "Ancient", "+13", etc. */
  tier: string
  slots: SlotMap
  /** Só em item único (`isSingleItem`); ausente em conjunto. */
  itemType?: ItemType
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

/** Tipos fixos. A lista do formulario junta estes com os bosses cadastrados. */
export const EVENT_TYPES = ['Castle Siege', 'Blood Castle', 'Chaos Castle', 'Boss', 'Outro'] as const

/**
 * Texto livre, e nao uniao fechada: alem dos tipos fixos, o formulario oferece
 * o nome de cada boss cadastrado em `bosses`, e essa lista muda em tempo de
 * execucao. Fechar o tipo aqui obrigaria a duplicar o catalogo no codigo.
 */
export type EventType = string

/** 0 = domingo ... 6 = sábado, igual a `Date#getDay()`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type Recurrence = {
  weekday: Weekday
  hour: number
  minute: number
}

export type GuildEvent = {
  id: string
  title: string
  description: string
  type: EventType
  /**
   * Uma data so, em ms desde a epoch. Continua existindo por causa dos eventos
   * criados antes de `dates`, e porque evento de data unica guarda as presencas
   * em `rsvps/{id}` -- mexer nisso perderia as confirmacoes ja dadas.
   */
  startsAt?: number
  /**
   * Varias datas no mesmo evento: chave gerada -> ms desde a epoch.
   *
   * Mapa, e nao array, porque o RTDB transforma array em objeto de chaves
   * numericas e abre espaco para buraco e reordenacao silenciosa. Cada data
   * tem sua propria lista de presenca, em `rsvpCycles/{id}/{chave}`, entao a
   * pessoa confirma dia a dia.
   */
  dates?: Record<string, number>
  /** Presente quando o evento se repete toda semana no mesmo dia e hora. */
  recurrence?: Recurrence
  /** Evento fixado aparece no topo da agenda, antes dos demais. */
  pinned?: boolean
  /** Se a guild confirma presença nesse evento. Ausente conta como `true`
   *  (eventos criados antes desse campo existir já tinham RSVP). */
  rsvpEnabled?: boolean
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

/* ---------------- status no MuEliteWars (scraper externo) ---------------- */

/**
 * Situação de um personagem da guild no site oficial, lida por um scraper que
 * roda fora do app (GitHub Actions, ver `scripts/scrape-mu.mjs`) porque o
 * navegador do jogador não consegue buscar isso direto — o site não libera
 * CORS. O scraper escreve aqui; o app só lê, em tempo real.
 */
export type MuCharStatus = {
  id: string
  name: string
  charClass: string
  level: number
  resets: number
  online: boolean
  map: string
  x: number
  y: number
  /** uid do membro casado por nick, quando existe um membro com esse nick. */
  uid: string | null
  updatedAt?: number
}

export type MuStatus = {
  updatedAt: number
  guild: string
  online: number
  total: number
  chars: Record<string, Omit<MuCharStatus, 'id'>>
}

/* ---------------- catálogo de bosses ---------------- */

/**
 * Um horário de nascimento. Sem `weekday` é todo dia; com `weekday`, uma vez
 * por semana — mesma ideia de `Recurrence`, mas o dia é opcional porque boss
 * costuma nascer mais de uma vez por dia, não só uma vez por semana.
 */
export type BossSchedule = {
  weekday?: Weekday
  hour: number
  minute: number
}

export type BossLocation = {
  map: string
  x: number
  y: number
}

export type Boss = {
  id: string
  name: string
  location?: BossLocation
  /** O que dropa, dica de local, etc. Opcional de propósito. */
  notes?: string
  /**
   * Texto livre pra cadência sem horário fixo conhecido: "1x por dia",
   * "posição aleatória", "só pra guild dona do castelo". Muitos bosses de MU
   * não têm horário publicado — só local — e forçar um horário inventado
   * seria pior que não ter contador nenhum.
   */
  scheduleNote?: string
  /** N horários — um boss pode nascer várias vezes por dia. Pode ser vazio. */
  schedules?: BossSchedule[]
  createdBy: string
  createdByName: string
  createdAt?: number
}

/* ---------------- regras da guild ---------------- */

/** Um único bloco de texto, editado pelo admin — regras, código de conduta. */
export type GuildRules = {
  body: string
  updatedBy: string
  updatedAt?: number
}

/* ---------------- enquetes ---------------- */

export type Poll = {
  id: string
  question: string
  options: string[]
  /** Ausente = sem prazo, fica aberta até o admin fechar/excluir. */
  closesAt?: number
  createdBy: string
  createdByName: string
  createdAt?: number
}

/** Um voto por pessoa por enquete: `votes/{pollId}/{uid}` guarda o índice da opção. */
export type PollVote = {
  uid: string
  nick: string
  optionIndex: number
  votedAt?: number
}

/* ---------------- mural de recados ---------------- */

export type Shout = {
  id: string
  uid: string
  nick: string
  text: string
  createdAt?: number
}

/** Chave determinística do interesse de uma pessoa numa peça. */
export function reservationId(setId: string, slot: SlotKey, uid: string): string {
  return `${setId}__${slot}__${uid}`
}

/** Identifica a fila de uma peça, sem a pessoa. */
export function queueKey(setId: string, slot: SlotKey): string {
  return `${setId}__${slot}`
}
