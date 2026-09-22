import { DEFAULT_SLOTS } from '../types'
import type { GuildSet } from '../types'

export type SeedSet = Omit<GuildSet, 'id' | 'createdAt'>

/**
 * Ponto de partida do catálogo, não uma lista oficial.
 *
 * Servidores de MU privados alteram sets, tiers e composição de peças à
 * vontade, então aqui só entram os sets clássicos mais difundidos. Revise,
 * remova o que não existe no seu servidor e cadastre o que falta pela tela
 * de Catálogo.
 */
export const SEED_SETS: SeedSet[] = [
  // Dark Knight
  { name: 'Bronze Set', charClass: 'Dark Knight', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },
  { name: 'Leather Set', charClass: 'Dark Knight', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },
  { name: 'Scale Set', charClass: 'Dark Knight', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },
  { name: 'Brass Set', charClass: 'Dark Knight', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },
  { name: 'Plate Set', charClass: 'Dark Knight', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },
  { name: 'Dragon Set', charClass: 'Dark Knight', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },
  { name: 'Black Dragon Set', charClass: 'Dark Knight', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },

  // Dark Wizard
  { name: 'Pad Set', charClass: 'Dark Wizard', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },
  { name: 'Bone Set', charClass: 'Dark Wizard', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },
  { name: 'Sphinx Set', charClass: 'Dark Wizard', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },
  { name: 'Legendary Set', charClass: 'Dark Wizard', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },
  { name: 'Grand Soul Set', charClass: 'Dark Wizard', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },

  // Elf
  { name: 'Vine Set', charClass: 'Elf', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },
  { name: 'Silk Set', charClass: 'Elf', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },
  { name: 'Wind Set', charClass: 'Elf', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },
  { name: 'Spirit Set', charClass: 'Elf', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },
  { name: 'Guardian Set', charClass: 'Elf', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },
  { name: 'Divine Set', charClass: 'Elf', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },

  // Magic Gladiator
  { name: 'Volcano Set', charClass: 'Magic Gladiator', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },

  // Dark Lord
  { name: 'Light Plate Set', charClass: 'Dark Lord', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },
  { name: 'Adamantine Set', charClass: 'Dark Lord', tier: 'Normal', slots: DEFAULT_SLOTS, notes: '' },
]
