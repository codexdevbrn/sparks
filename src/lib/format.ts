const dateTime = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** Datas vindas do RTDB são milissegundos desde a epoch. */
export function formatDateTime(ms: number | undefined): string {
  if (!ms) return '—'
  return dateTime.format(new Date(ms))
}

/** Converte o valor de um `<input type="datetime-local">` em milissegundos. */
export function fromDateTimeLocal(value: string): number | null {
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

/** Converte milissegundos no formato aceito por `<input type="datetime-local">`. */
export function toDateTimeLocal(ms: number): string {
  const date = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** Mensagem legível para erros vindos do Firebase. */
export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: unknown }).code)
    if (code === 'PERMISSION_DENIED') return 'Você não tem permissão para esta ação.'
    if (code === 'auth/popup-closed-by-user') return 'Login cancelado.'
    if (code === 'auth/unauthorized-domain') {
      return 'Este domínio não está autorizado no Firebase Authentication.'
    }
  }
  // O SDK do RTDB costuma sinalizar negativa de permissão só na mensagem.
  if (err instanceof Error) {
    if (err.message.includes('permission_denied') || err.message.includes('PERMISSION_DENIED')) {
      return 'Você não tem permissão para esta ação.'
    }
    return err.message
  }
  return 'Erro inesperado.'
}

/** `true` quando o erro é negativa de permissão do banco. */
export function isPermissionDenied(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    if (String((err as { code: unknown }).code) === 'PERMISSION_DENIED') return true
  }
  return err instanceof Error && /permission[_ ]denied/i.test(err.message)
}
