/**
 * Aviso opcional no Discord da guild quando algo acontece no site.
 *
 * O navegador chama `/api/discord` (Vercel Edge Function, ver `api/discord.ts`),
 * que repassa pro webhook do Discord. A URL do webhook fica só no servidor
 * (`DISCORD_WEBHOOK_URL`, sem prefixo `VITE_`) — nunca no bundle público do
 * site. Se essa rota não existir (site publicado só no Firebase Hosting, que
 * não roda função nenhuma) ou o webhook não estiver configurado na Vercel,
 * a chamada falha em silêncio: nenhuma tela depende do resultado.
 */
export async function notifyDiscord(content: string): Promise<void> {
  try {
    await fetch('/api/discord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
  } catch {
    // Aviso perdido não pode travar a ação principal (publicar, entregar, etc).
  }
}
