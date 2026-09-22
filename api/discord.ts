// Vercel Edge Function — proxy pro webhook do Discord.
//
// Duas coisas acontecem aqui, e elas são diferentes:
//
// 1. A URL do webhook (`DISCORD_WEBHOOK_URL`, sem prefixo VITE_) fica só no
//    servidor, nunca no bundle público do site.
// 2. A rota só aceita quem é membro aprovado da guild. Sem isso, esconder a URL
//    não adianta nada: a própria rota vira o canal de spam, aberto a qualquer
//    um que descubra o endereço.
//
// A verificação não usa service account. O cliente manda o ID token do Firebase
// e nós usamos ESSE token para ler `members/{uid}/role` na API REST do RTDB — o
// banco recusa token forjado ou expirado, então a validação criptográfica é
// dele. O payload do JWT é lido sem verificar só para descobrir o uid que monta
// o caminho; um uid mentiroso não passaria na leitura.
export const config = { runtime: 'edge' }

const DATABASE_URL =
  process.env.FIREBASE_DATABASE_URL ?? 'https://sparks-75de5-default-rtdb.firebaseio.com'

function decodeUid(idToken: string): string | null {
  const parts = idToken.split('.')
  if (parts.length !== 3) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as { sub?: unknown }
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null
  } catch {
    return null
  }
}

/** Lê o cargo usando o token de quem chamou; token inválido devolve 401 aqui. */
async function roleOf(uid: string, idToken: string): Promise<string | null> {
  const url = `${DATABASE_URL}/members/${uid}/role.json?auth=${encodeURIComponent(idToken)}`
  const res = await fetch(url)
  if (!res.ok) return null
  const role: unknown = await res.json()
  return typeof role === 'string' ? role : null
}

function extractContent(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const content = (body as Record<string, unknown>).content
  return typeof content === 'string' && content.length > 0 ? content.slice(0, 2000) : null
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const auth = request.headers.get('authorization') ?? ''
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!idToken) return new Response('Sem credencial', { status: 401 })

  const uid = decodeUid(idToken)
  if (!uid) return new Response('Credencial malformada', { status: 401 })

  const role = await roleOf(uid, idToken)
  if (role === null) return new Response('Credencial inválida', { status: 401 })
  // Quem está só aguardando aprovação não fala pelo Discord da guild.
  if (role !== 'member' && role !== 'admin') {
    return new Response('Sem permissão', { status: 403 })
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  if (!webhookUrl) {
    return new Response('Webhook não configurado', { status: 501 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response('JSON inválido', { status: 400 })
  }

  const content = extractContent(body)
  if (!content) {
    return new Response('Campo "content" ausente', { status: 400 })
  }

  const discordRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })

  return new Response(null, { status: discordRes.ok ? 204 : 502 })
}
