import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'

export default function JoinPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [info, setInfo] = useState<{ role: string; orgName: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setError('No invite token found.'); return }
    api.members.invites.lookup(token)
      .then(setInfo)
      .catch(e => setError(e.message))
  }, [token])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#070a10] to-[#0f1117]">
        <div className="bg-white/8 backdrop-blur-xl border border-white/10 rounded-2xl p-10 text-center max-w-sm w-full">
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-white mb-2">Invalid Invite</h1>
          <p className="text-sm text-gray-400">{error}</p>
        </div>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#070a10] to-[#0f1117]">
        <p className="text-gray-400 text-sm">Validating invite…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#070a10] to-[#0f1117]">
      {/* Background glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-brand-600/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative bg-white/8 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-10 w-full max-w-sm text-center">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center mx-auto mb-4">
          <span className="text-white text-xl font-bold">S</span>
        </div>

        <h1 className="text-2xl font-bold text-white mb-1">You're invited!</h1>
        <p className="text-sm text-gray-400 mb-6">
          Join <span className="text-white font-semibold">{info.orgName}</span> on RaxTeam as a{' '}
          <span className="text-brand-400 font-semibold">{info.role}</span>
        </p>

        <div className="flex flex-col gap-3 mb-2">
          <a
            href={api.loginUrl(token)}
            className="flex items-center justify-center gap-3 w-full py-3 px-4 bg-white hover:bg-gray-100 text-gray-900 rounded-xl font-semibold transition-colors text-sm"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Accept with GitHub
          </a>
          <a
            href={api.googleLoginUrl(token)}
            className="flex items-center justify-center gap-3 w-full py-3 px-4 bg-white/8 hover:bg-white/12 border border-white/10 text-white rounded-xl font-semibold transition-colors text-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Accept with Google
          </a>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Sign in with any account to accept. You'll be added to <span className="text-white/60">{info.orgName}</span>.
        </p>
      </div>
    </div>
  )
}
