import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SA_API, SA_PATH, setSAToken, isSALoggedIn } from '../lib/superadmin'

export { getSAToken, setSAToken, clearSAToken, isSALoggedIn, saRequest } from '../lib/superadmin'

export default function SuperAdminLoginPage() {
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  // Already logged in
  if (isSALoggedIn()) {
    navigate(`${SA_PATH}/dashboard`, { replace: true })
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!secret.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${SA_API}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      })
      if (!res.ok) {
        setError('Invalid credentials')
        return
      }
      const { token } = await res.json()
      setSAToken(token)
      navigate(`${SA_PATH}/dashboard`, { replace: true })
    } catch {
      setError('Connection failed. Check console.')
    } finally {
      setLoading(false)
      setSecret('')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#030508]">
      <div className="w-full max-w-xs mx-4">
        <form onSubmit={handleSubmit} className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-8 shadow-2xl shadow-black/60">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-xs font-mono text-slate-500 tracking-widest uppercase">Superadmin</span>
          </div>

          <div className="mb-6">
            <input
              type="password"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              placeholder="Access key"
              autoComplete="off"
              autoFocus
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 text-sm font-mono focus:outline-none focus:border-amber-500/50 transition-colors"
            />
          </div>

          {error && <p className="text-red-400 text-xs mb-4 font-mono">{error}</p>}

          <button
            type="submit"
            disabled={loading || !secret.trim()}
            className="w-full py-3 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying…' : 'Authenticate'}
          </button>
        </form>
      </div>
    </div>
  )
}
