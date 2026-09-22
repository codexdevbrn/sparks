/**
 * Normaliza links de imagem colados no anúncio.
 *
 * O caso chato é o Google Drive: o link de compartilhamento aponta para uma
 * página HTML, não para o arquivo, então um `<img src>` nele não carrega. Existe
 * um endereço que serve o binário, e é para ele que convertemos — mas ele não é
 * documentado pelo Google e já mudou no passado. Por isso o formulário mostra
 * pré-visualização: se quebrar, quebra na cara de quem está publicando, e não
 * para a guild inteira depois.
 */

const DRIVE_ID_PATTERNS = [
  /drive\.google\.com\/file\/d\/([\w-]+)/,
  /drive\.google\.com\/open\?id=([\w-]+)/,
  /drive\.google\.com\/uc\?(?:[^#]*&)?id=([\w-]+)/,
  /docs\.google\.com\/uc\?(?:[^#]*&)?id=([\w-]+)/,
]

/** Extrai o id do arquivo de um link do Google Drive, se for um. */
export function driveFileId(url: string): string | null {
  for (const pattern of DRIVE_ID_PATTERNS) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

/** Converte link do Drive no endereço que serve o arquivo; o resto passa direto. */
export function normalizeImageUrl(raw: string): string {
  const url = raw.trim()
  if (!url) return ''

  const id = driveFileId(url)
  if (id) return `https://lh3.googleusercontent.com/d/${id}`

  return url
}

/** `true` se o link só funciona por um caminho não garantido pelo provedor. */
export function isFragileHost(raw: string): boolean {
  return driveFileId(raw) !== null
}

/** Rejeita esquemas que não fazem sentido num `<img src>` vindo de terceiro. */
export function isSafeImageUrl(url: string): boolean {
  return /^https:\/\//i.test(url)
}
