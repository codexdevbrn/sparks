// Busca o status da guild no MuEliteWars e grava em `muStatus` no RTDB.
//
// Roda fora do app (GitHub Actions, ver .github/workflows/scrape-mu.yml)
// porque o navegador do jogador não consegue: o site não libera CORS para
// leitura via fetch do front-end. Aqui, com Node, não há esse limite.
//
// O site não tem API — os dados vêm de HTML renderizado no servidor (PHP),
// então a leitura é por regex em cima da tabela de perfil. Values() é o
// endereço que quebra se o site mudar o layout; nesse caso o job falha e
// aparece no log do Actions, não silenciosamente.
import { cert, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

const BASE_URL = 'https://muelitewars.com'
const GUILD_NAME = process.env.MU_GUILD_NAME || 'Sparks'
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://sparks-75de5-default-rtdb.firebaseio.com'

// O site bloqueia requisições sem cara de navegador com 406.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchHtml(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: HEADERS })
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`)
  return res.text()
}

/** Extrai os nomes de personagem listados na página da guild. */
function extractCharNames(guildHtml) {
  const names = new Set()
  const re = /\/profile\/character\/([^"]+)"[^>]*>/g
  let m
  while ((m = re.exec(guildHtml))) names.add(decodeURIComponent(m[1]))
  return [...names]
}

/** Lê os campos da tabela `Personagem / Classe / Resets / Level / Mapa / Situação`. */
function parseCharPage(html) {
  const field = (label) => {
    const m = html.match(new RegExp(`<td>${label}</td>\\s*<td>([\\s\\S]*?)</td>`))
    return m ? m[1].replace(/\s+/g, ' ').trim() : ''
  }

  const statusMatch = html.match(/<span class="text-(success|danger)">(Online|Offline)<\/span>/)
  const online = statusMatch ? statusMatch[1] === 'success' : false

  const mapRaw = field('Mapa')
  const mapMatch = mapRaw.match(/^(.*?)\s*\((\d+)\/(\d+)\)/)

  return {
    charClass: field('Classe'),
    level: Number(field('Level')) || 0,
    resets: Number(field('Resets')) || 0,
    online,
    map: mapMatch ? mapMatch[1].trim() : mapRaw,
    x: mapMatch ? Number(mapMatch[2]) : 0,
    y: mapMatch ? Number(mapMatch[3]) : 0,
  }
}

/** RTDB não aceita `. # $ [ ] /` em chave. */
function sanitizeKey(name) {
  return name.replace(/[.#$/[\]]/g, '_')
}

// Guardado fora de main() para ser encerrado tambem quando main() lanca.
let app = null

async function main() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!serviceAccountJson) throw new Error('Variável FIREBASE_SERVICE_ACCOUNT ausente.')

  app = initializeApp({
    credential: cert(JSON.parse(serviceAccountJson)),
    databaseURL: DATABASE_URL,
  })
  const db = getDatabase()

  console.log(`Buscando a guild "${GUILD_NAME}"...`)
  const guildHtml = await fetchHtml(`/profile/guild/${encodeURIComponent(GUILD_NAME)}`)
  const names = extractCharNames(guildHtml)
  console.log(`${names.length} personagem(ns) na guild.`)
  if (names.length === 0) throw new Error('Nenhum personagem encontrado — o site pode ter mudado o layout.')

  // Casa por nick (minúsculo) para saber a quem, no app, cada personagem pertence.
  const membersSnap = await db.ref('members').get()
  const members = membersSnap.val() ?? {}
  const uidByNick = new Map()
  for (const [uid, m] of Object.entries(members)) {
    if (m?.nick) uidByNick.set(String(m.nick).toLowerCase(), uid)
  }

  // Gravação é `set()` no nó inteiro, então um personagem que falhou agora
  // sumiria da tela. Partimos do que já estava lá e sobrescrevemos só o que
  // conseguimos ler: dado velho, com seu `updatedAt` antigo, é melhor que
  // ninguém. A tela mostra a idade de cada registro.
  const previousSnap = await db.ref('muStatus/chars').get()
  const chars = previousSnap.val() ?? {}

  let failed = 0
  const updatedAt = Date.now()

  for (const name of names) {
    try {
      const html = await fetchHtml(`/profile/character/${encodeURIComponent(name)}`)
      const parsed = parseCharPage(html)
      chars[sanitizeKey(name)] = {
        name,
        ...parsed,
        uid: uidByNick.get(name.toLowerCase()) ?? null,
        updatedAt,
      }
    } catch (err) {
      failed += 1
      console.warn(`Falhou ao buscar "${name}": ${err.message}`)
    }
    // Um intervalo pequeno entre requisições, por educação com o servidor deles.
    await sleep(400)
  }

  // Quem saiu da guild não deve ficar preso no nó para sempre.
  const current = new Set(names.map(sanitizeKey))
  for (const key of Object.keys(chars)) {
    if (!current.has(key)) delete chars[key]
  }

  if (failed === names.length) {
    throw new Error('Nenhum personagem pôde ser lido — o site pode estar fora do ar.')
  }

  // Sai do resultado final, e nao do laco: assim o numero bate com a lista
  // exibida, que pode conter registro preservado de uma rodada anterior.
  const onlineCount = Object.values(chars).filter((c) => c.online).length

  await db.ref('muStatus').set({
    updatedAt,
    guild: GUILD_NAME,
    online: onlineCount,
    total: names.length,
    chars,
  })

  console.log(`OK: ${onlineCount}/${names.length} online${failed ? ` (${failed} falha(s))` : ''}.`)
}

// O RTDB do Admin SDK abre um websocket que segura o event loop: sem fechar, o
// processo nunca encerra. No GitHub Actions isso prenderia o job ate o timeout
// e o marcaria como falha, mesmo com a gravacao bem-sucedida. Vale tanto no
// sucesso quanto no erro -- uma falha depois da conexao aberta travaria igual.
main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    if (app) await app.delete()
  })
