import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { GUILD_NAME } from '../lib/firebase'
import { Button, cx } from './ui'

type NavItem = { to: string; label: string; adminOnly?: boolean }

const NAV: NavItem[] = [
  { to: '/', label: 'Anúncios' },
  { to: '/sets', label: 'Sets' },
  { to: '/eventos', label: 'Eventos' },
  { to: '/membros', label: 'Membros' },
  { to: '/escolhas', label: 'Escolhas', adminOnly: true },
]

function navClass({ isActive }: { isActive: boolean }): string {
  return cx(
    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-amber-500/10 text-amber-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
  )
}

export function Layout() {
  const { member, isAdmin, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  const items = NAV.filter((item) => !item.adminOnly || isAdmin)

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2 text-base font-bold tracking-tight">
            <span className="text-amber-500">⚔</span>
            <span className="text-zinc-50">{GUILD_NAME}</span>
          </NavLink>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={navClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
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
                {item.label}
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
    </div>
  )
}
