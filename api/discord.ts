// Vercel Edge Function — proxy pro webhook do Discord.
//
// O navegador chama esta rota, não o Discord direto: assim a URL do webhook
// (`DISCORD_WEBHOOK_URL`, sem prefixo VITE_) fica só no servidor, nunca no
// bundle público do site. Sem isso, qualquer um que abrisse o site
// conseguiria extrair a URL e postar spam no canal.
export const config = { runtime: 'edge' }

function extractContent(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const content = (body as Record<string, unknown>).content
  return typeof content === 'string' && content.length > 0 ? content.slice(0, 2000) : null
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
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
