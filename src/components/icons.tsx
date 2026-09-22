import type { SlotKey } from '../types'

/** Emblema da guild: espadas cruzadas. Mesmo desenho do favicon, em `currentColor`. */
export function SwordsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <g transform="rotate(45 12 12)">
        <rect x="11" y="2" width="2" height="13" rx="1" />
        <rect x="8" y="14" width="8" height="2" rx="1" />
        <rect x="11" y="16.5" width="2" height="3.5" rx="1" />
      </g>
      <g transform="rotate(-45 12 12)">
        <rect x="11" y="2" width="2" height="13" rx="1" />
        <rect x="8" y="14" width="8" height="2" rx="1" />
        <rect x="11" y="16.5" width="2" height="3.5" rx="1" />
      </g>
    </svg>
  )
}

/** Logo oficial do Discord, em `currentColor` pra acompanhar o tema. */
export function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 19" fill="currentColor" className={className} aria-hidden>
      <path d="M16.224 3.768a14.5 14.5 0 0 0-3.67-1.153c-.158.286-.343.67-.47.976a13.5 13.5 0 0 0-4.067 0c-.128-.306-.317-.69-.476-.976A14.4 14.4 0 0 0 3.868 3.77C1.546 7.28.916 10.703 1.231 14.077a14.7 14.7 0 0 0 4.5 2.306q.545-.748.965-1.587a9.5 9.5 0 0 1-1.518-.74q.191-.14.372-.293c2.927 1.369 6.107 1.369 8.999 0q.183.152.372.294-.723.437-1.52.74.418.838.963 1.588a14.6 14.6 0 0 0 4.504-2.308c.37-3.911-.63-7.302-2.644-10.309m-9.13 8.234c-.878 0-1.599-.82-1.599-1.82 0-.998.705-1.82 1.6-1.82.894 0 1.614.82 1.599 1.82.001 1-.705 1.82-1.6 1.82m5.91 0c-.878 0-1.599-.82-1.599-1.82 0-.998.705-1.82 1.6-1.82.893 0 1.614.82 1.599 1.82 0 1-.706 1.82-1.6 1.82" />
    </svg>
  )
}

/**
 * Um glifo por peça de equipamento, pra reconhecer a fila de longe sem ler o
 * rótulo — igual à barra de equipamento do próprio jogo. Desenhado à mão
 * (stroke, `currentColor`) em vez de baixado de algum lugar: ícone de UI
 * precisa existir sempre, em qualquer tamanho, sem depender de link externo
 * no ar.
 */
export function SlotIcon({ slot, className }: { slot: SlotKey; className?: string }) {
  const props = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  }

  switch (slot) {
    case 'helm':
      return (
        <svg {...props}>
          <path d="M4 13a8 8 0 0 1 16 0v3H4z" />
          <path d="M4 16h16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
          <path d="M12 5v3" />
        </svg>
      )
    case 'armor':
      return (
        <svg {...props}>
          <path d="M8 4 4 6v5c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-4-2-4 2z" />
        </svg>
      )
    case 'pants':
      return (
        <svg {...props}>
          <path d="M7 3h10l1 8-2 10h-3l-1-9-1 9H8L6 11z" />
        </svg>
      )
    case 'gloves':
      return (
        <svg {...props}>
          <path d="M7 12V6a2 2 0 1 1 4 0v4M11 10V5a2 2 0 1 1 4 0v5M15 10V6a2 2 0 1 1 4 0v6a6 6 0 0 1-6 6H9a4 4 0 0 1-4-4v-3l2-2" />
        </svg>
      )
    case 'boots':
      return (
        <svg {...props}>
          <path d="M9 3v9l-5 4v3a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1c0-2-2-3-4-4l-3-2V3z" />
        </svg>
      )
    case 'weapon':
      return (
        <svg {...props}>
          <path d="m6 18 10-10M14 4l6 6M4 20l2-2M14.5 5.5l4 4" />
        </svg>
      )
    case 'shield':
      return (
        <svg {...props}>
          <path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z" />
        </svg>
      )
    case 'item':
      return (
        <svg {...props}>
          <path d="m12 2 3 6 6 .9-4.5 4.3 1 6.3L12 16.5 6.5 19.5l1-6.3L3 8.9 9 8z" />
        </svg>
      )
  }
}
