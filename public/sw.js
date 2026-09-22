// Service worker mínimo: só o suficiente pra instalar como app e abrir
// offline com o que já foi visitado. Não precache nada (os nomes dos
// arquivos do build mudam a cada deploy, então uma lista fixa quebraria) —
// em vez disso, guarda em cache o que passa pela rede, e serve de lá quando
// a rede falha.
//
// Só mexe em pedido same-origin e GET. Tudo que é do Firebase
// (Auth, Realtime Database) passa direto, sem cache — dado ao vivo não pode
// vir de cache velho.
const CACHE_NAME = 'sparks-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        if (request.mode === 'navigate') {
          const shell = await caches.match('/')
          if (shell) return shell
        }
        throw new Error('Sem rede e sem cache pra ' + request.url)
      }),
  )
})
