import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { setToken, popReturnTo } from '../lib/api'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

export default function AuthCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    const code = params.get('code')
    if (!code) {
      setError('No auth code received.')
      return
    }

    fetch(`${API_URL}/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then(res => {
        if (!res.ok) throw new Error('Auth exchange failed')
        return res.json() as Promise<{ apiKey: string }>
      })
      .then(data => {
        setToken(data.apiKey)
        // Replace history entry so back button doesn't return to /auth/callback
        navigate(popReturnTo() ?? '/skills', { replace: true })
      })
      .catch(() => setError('Sign-in failed. Please try again.'))
  }, [])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#070a10] to-[#0f1117]">
        <div className="bg-white/8 backdrop-blur-xl border border-white/10 rounded-2xl p-10 text-center max-w-sm">
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <a href="/login" className="text-brand-400 text-sm hover:underline">Back to login</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#070a10] to-[#0f1117]">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Signing you in…</p>
      </div>
    </div>
  )
}
