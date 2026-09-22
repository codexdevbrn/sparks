/**
 * Aviso opcional no Discord da guild quando algo acontece no site.
 *
 * Sem backend, quem manda a mensagem é o próprio navegador do admin que fez
 * a ação — webhook do Discord aceita POST direto do navegador (CORS
 * liberado por eles). Só funciona se `VITE_DISCORD_WEBHOOK_URL` estiver
 * configurada; sem isso, não faz nada, e nenhuma tela depende do resultado.
 *
 * Aviso: essa URL de webhook fica pública no bundle do site, do jeito que
 * qualquer variável `VITE_*` fica. Ao contrário das chaves do Firebase, ela
 * não é protegida por regra nenhuma — quem a pegar pode postar no canal
 * configurado. O pior uso indevido possível é spam nesse canal (o webhook
 * não dá nenhum outro acesso ao servidor); ainda assim, crie um webhook só
 * pra isso, num canal que você não se importa de precisar recriar se
 * alguém abusar.
 */
const WEBHOOK_URL = import.meta.env.VITE_DISCORD_WEBHOOK_URL as string | undefined

export async function notifyDiscord(content: string): Promise<void> {
  if (!WEBHOOK_URL) return
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
  } catch {
    // Aviso perdido não pode travar a ação principal (publicar, entregar, etc).
  }
}
