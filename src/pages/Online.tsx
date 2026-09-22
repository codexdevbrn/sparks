import { useEffect, useMemo, useState } from 'react'
import { onValue, ref } from 'firebase/database'
import { useAuth } from '../lib/auth'
import { db } from '../lib/firebase'
import { errorMessage, formatDateTime } from '../lib/format'
import { Badge, Button, Card, EmptyState, ErrorNote, PageHeader, Spinner, cx } from '../components/ui'
import type { MuCharStatus, MuStatus } from '../types'

/** "há 3min", "há 1h" — não precisa de precisão, só dar a sensação de "ao vivo". */
function timeAgo(ms: number, now: number): string {
  const diff = Math.max(0, now - ms)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

export function Online() {
  const { member } = useAuth()
  const [status, setStatus] = useState<MuStatus | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [spinning, setSpinning] = useState(false)

  useEffect(() => {
    return onValue(
      ref(db, 'muStatus'),
      (snap) => setStatus(snap.val()),
      (err) => setError(errorMessage(err)),
    )
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  /**
   * Os dados já chegam em tempo real do RTDB — não há o que "buscar" aqui.
   * O botão recalcula "há Xmin" na hora, em vez de esperar o próximo tick de
   * 30s. A próxima varredura de verdade no site continua sendo o robô, a
   * cada 10 minutos.
   */
  function refresh() {
    setNow(Date.now())
    setSpinning(true)
    setTimeout(() => setSpinning(false), 500)
  }

  const { online, offline } = useMemo(() => {
    const chars: MuCharStatus[] = Object.entries(status?.chars ?? {}).map(([id, c]) => ({ id, ...c }))
    const byName = (a: MuCharStatus, b: MuCharStatus) => a.name.localeCompare(b.name)
    return {
      online: chars.filter((c) => c.online).sort(byName),
      offline: chars.filter((c) => !c.online).sort(byName),
    }
  }, [status])

  if (status === undefined) return <Spinner />

  return (
    <>
      <PageHeader
        title="Online agora"
        description="Quem da guild está logado no MuEliteWars, e onde — pra saber com quem contar pra uma corrida rápida."
        action={
          status && (
            <div className="text-right">
              <Button variant="secondary" size="sm" onClick={refresh}>
                <span className={cx('inline-block', spinning && 'animate-spin')}>↻</span>
                Atualizar
              </Button>
              <p className="mt-1 text-xs text-zinc-500">
                Última varredura: {formatDateTime(status.updatedAt)} ({timeAgo(status.updatedAt, now)})
              </p>
            </div>
          )
        }
      />

      <ErrorNote message={error} />

      {status === null ? (
        <EmptyState
          title="Ainda sem dados"
          description="Um robô busca esse status a cada poucos minutos em muelitewars.com. Se acabou de configurar, aguarde a primeira rodada."
        />
      ) : (
        <>
          <p className="mb-6 text-xs text-zinc-500">
            {status.online} de {status.total} personagem(ns) da guild online · dados de{' '}
            <a
              href="https://muelitewars.com"
              target="_blank"
              rel="noreferrer"
              className="text-amber-500 hover:underline"
            >
              muelitewars.com
            </a>
          </p>

          {online.length === 0 ? (
            <EmptyState title="Ninguém online agora" />
          ) : (
            <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {online.map((c) => (
                <CharCard key={c.id} char={c} mine={c.uid === member?.uid} />
              ))}
            </div>
          )}

          {offline.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-medium tracking-wide text-zinc-500 uppercase">
                Offline ({offline.length})
              </h2>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-zinc-800">
                  {offline.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                      <span className="size-2 shrink-0 rounded-full bg-zinc-700" />
                      <span className="min-w-0 truncate text-zinc-300">
                        {c.name}
                        {c.uid === member?.uid && <span className="ml-2 text-xs text-zinc-500">(você)</span>}
                      </span>
                      <span className="text-xs text-zinc-600">{c.charClass}</span>
                      <span className="ml-auto shrink-0 text-xs text-zinc-600">
                        {c.map} ({c.x}/{c.y})
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </>
      )}
    </>
  )
}

function CharCard({ char, mine }: { char: MuCharStatus; mine: boolean }) {
  return (
    <Card className={cx('p-4', mine && 'border-amber-500/40 bg-amber-500/5')}>
      <div className="flex items-center gap-2">
        <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
        <h3 className="truncate text-sm font-semibold text-zinc-50">{char.name}</h3>
        {mine && <Badge tone="amber">Você</Badge>}
      </div>
      <p className="mt-1 text-xs text-zinc-400">
        {char.charClass || 'Classe desconhecida'} · Lvl {char.level}
        {char.resets > 0 && ` · ${char.resets} resets`}
      </p>
      <p className="mt-2 text-xs text-emerald-400">
        {char.map} ({char.x}/{char.y})
      </p>
    </Card>
  )
}
