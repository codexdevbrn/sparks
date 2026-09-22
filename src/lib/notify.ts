/**
 * Notificação do navegador — só funciona com a aba aberta (em primeiro ou
 * segundo plano), porque não há push de verdade sem um servidor mandando
 * (o mesmo problema de infra do resto do projeto: sem Cloud Functions, não
 * dá pra acordar o navegador com a aba fechada). Enquanto a guild mantiver
 * a aba de Bosses aberta, o aviso funciona igual a um alarme.
 */
export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied'
  return Notification.requestPermission()
}

export function sendNotification(title: string, body?: string): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, icon: '/favicon.svg' })
  } catch {
    // Alguns navegadores recusam notificação fora de contexto seguro/foco —
    // não é motivo pra quebrar a tela.
  }
}
