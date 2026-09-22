import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { onValue, ref } from 'firebase/database'
import { useAuth } from '../lib/auth'
import { db, GUILD_NAME } from '../lib/firebase'
import { DiscordIcon, SwordsIcon } from './icons'
import { InstallPwaFooter } from './InstallPwa'
import { Button, cx } from './ui'

const DISCORD_INVITE_URL = import.meta.env.VITE_DISCORD_INVITE_URL

type NavItem = { to: string; label: string; adminOnly?: boolean }

const NAV: NavItem[] = [
  { to: '/', label: 'Anúncios' },
  { to: '/mural', label: 'Mural' },
  { to: '/online', label: 'Online' },
  { to: '/sets', label: 'Sets' },
  { to: '/historico', label: 'Histórico' },
  { to: '/eventos', label: 'Eventos' },
  { to: '/bosses', label: 'Bosses' },
  { to: '/enquetes', label: 'Enquetes' },
  { to: '/regras', label: 'Regras' },
  { to: '/membros', label: 'Membros' },
  { to: '/escolhas', label: 'Escolhas', adminOnly: true },
]

/** Só o contador, pra não puxar a lista inteira de status em todo mundo de menu. */
function useOnlineCount(): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    return onValue(ref(db, 'muStatus/online'), (snap) => setCount(snap.val() ?? 0))
  }, [])
  return count
}

function navClass({ isActive }: { isActive: boolean }): string {
  return cx(
    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-amber-500/10 text-amber-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
  )
}

export function Layout() {
  const { member, isAdmin, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const onlineCount = useOnlineCount()

  const items = NAV.filter((item) => !item.adminOnly || isAdmin)

  function label(item: NavItem) {
    if (item.to !== '/online' || onlineCount === 0) return item.label
    return (
      <span className="inline-flex items-center gap-1.5">
        {item.label}
        <span className="size-1.5 rounded-full bg-emerald-500" />
        {onlineCount}
      </span>
    )
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2 text-base font-bold tracking-tight">
            <SwordsIcon className="size-5 shrink-0 text-amber-500" />
            <span className="font-display text-zinc-50">{GUILD_NAME}</span>
          </NavLink>

          <nav className="ml-4 hidden flex-wrap items-center gap-1 md:flex">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={navClass}>
                {label(item)}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {DISCORD_INVITE_URL && (
              <a
                href={DISCORD_INVITE_URL}
                target="_blank"
                rel="noreferrer"
                title="Entrar no Discord da guild"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
              >
                <DiscordIcon className="size-4.5" />
              </a>
            )}
            <NavLink to="/perfil" className="hidden text-right sm:block">
              <span className="block text-sm font-medium text-zinc-200">{member?.nick || 'Perfil'}</span>
              <span className="block text-xs text-zinc-500">{member?.charClass || 'sem classe'}</span>
            </NavLink>
            <Button variant="secondary" size="sm" onClick={() => void logout()}>
              Sair
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu"
              aria-expanded={menuOpen}
            >
              ☰
            </Button>
          </div>
        </div>

        {menuOpen && (
          <nav className="flex flex-col gap-1 border-t border-zinc-800 px-4 py-2 md:hidden">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={navClass}
                onClick={() => setMenuOpen(false)}
              >
                {label(item)}
              </NavLink>
            ))}
            <NavLink to="/perfil" className={navClass} onClick={() => setMenuOpen(false)}>
              Perfil
            </NavLink>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>

      <InstallPwaFooter />
    </div>
  )
}
