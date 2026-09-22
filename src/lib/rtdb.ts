/**
 * Utilidades de leitura do Realtime Database.
 *
 * Um nó do RTDB volta como objeto `{ chave: valor }`, e a chave carrega a
 * identidade do registro. Estas funções fazem a conversão para lista já com o
 * id embutido, que é o formato com que as telas trabalham.
 */

/** Converte o valor de um nó em lista, promovendo a chave a campo de id. */
export function listFrom<T>(value: unknown, idField: 'id' | 'uid' = 'id'): T[] {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value as Record<string, object>).map(
    ([key, data]) => ({ ...data, [idField]: key }) as T,
  )
}

/** Converte o valor de um nó em Map indexado pela chave. */
export function mapFrom<T>(value: unknown): Map<string, T> {
  if (!value || typeof value !== 'object') return new Map()
  return new Map(
    Object.entries(value as Record<string, object>).map(
      ([key, data]) => [key, { ...data, id: key } as T] as const,
    ),
  )
}
