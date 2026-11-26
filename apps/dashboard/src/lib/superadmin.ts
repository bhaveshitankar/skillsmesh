// Shared superadmin helpers — single source of truth for API URL and token storage

export const SA_API = `${import.meta.env.VITE_API_URL ?? 'https://api.raxteam.com'}/sa`
export const SA_PATH = `/${import.meta.env.VITE_SA_PATH ?? 'superadmin'}`
const TOKEN_KEY = 'sa_token'

export const getSAToken = () => localStorage.getItem(TOKEN_KEY)
export const setSAToken = (t: string) => localStorage.setItem(TOKEN_KEY, t)
export const clearSAToken = () => localStorage.removeItem(TOKEN_KEY)
export const isSALoggedIn = () => !!getSAToken()

export async function saRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SA_API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getSAToken()}`,
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 404 || res.status === 401) {
    clearSAToken()
    window.location.href = SA_PATH
    throw new Error('Session expired')
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}
