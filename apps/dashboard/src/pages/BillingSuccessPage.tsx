import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'

export default function BillingSuccessPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const t = setTimeout(() => navigate('/skills'), 6000)
    return () => clearTimeout(t)
  }, [navigate])

  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-gradient-to-b from-emerald-50 to-white">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5 shadow-sm">
          <svg className="w-10 h-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Pro! 🚀</h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">
          Your account has been upgraded. You now have access to unlimited skills, higher-accuracy embeddings, rich asset attachments, and RAG-powered resolve.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-7 text-left">
          {[
            { icon: '♾️', label: 'Unlimited skills & calls' },
            { icon: '🔍', label: '768-dim embeddings' },
            { icon: '📎', label: 'Rich assets & RAG' },
            { icon: '👥', label: 'Unlimited team seats' },
          ].map(f => (
            <div key={f.label} className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
              <span className="text-base">{f.icon}</span>
              <span className="text-xs font-medium text-emerald-800">{f.label}</span>
            </div>
          ))}
        </div>

        <Link
          to="/skills"
          className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-semibold text-sm transition-colors shadow-sm"
        >
          Go to Skills
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
        <p className="text-xs text-gray-400 mt-4">Redirecting automatically in a few seconds…</p>
      </div>
    </div>
  )
}
