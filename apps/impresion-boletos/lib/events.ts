// Pub/sub en memoria para empujar boletos nuevos a la pantalla de cada punto
// vía Server-Sent Events. Solo sirve para un único proceso Node de `next start`
// (que es como corre esta app); no funciona si se escala a varias instancias
// sin un broker externo (Redis, etc.), pero para un punto de venta con unas
// pocas pantallas es más que suficiente y evita depender de infraestructura extra.

type Listener = (data: unknown) => void

const globalForEvents = globalThis as unknown as {
  ibListeners?: Map<string, Set<Listener>>
}

const listeners = globalForEvents.ibListeners ?? new Map<string, Set<Listener>>()
globalForEvents.ibListeners = listeners

export function subscribe(token: string, listener: Listener): () => void {
  let set = listeners.get(token)
  if (!set) {
    set = new Set()
    listeners.set(token, set)
  }
  set.add(listener)
  return () => {
    set?.delete(listener)
    if (set && set.size === 0) listeners.delete(token)
  }
}

export function publish(token: string, data: unknown): void {
  const set = listeners.get(token)
  if (!set) return
  Array.from(set).forEach((listener) => listener(data))
}
