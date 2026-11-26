import { useState, useEffect, type FormEvent } from 'react'
import { api } from '../lib/api'

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Pre-fill name/email from logged-in user
  useEffect(() => {
    api.me().then(({ user }) => {
      setForm(f => ({ ...f, name: user.name || '', email: user.email || '' }))
    }).catch(() => {})
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true); setResult(null)
    try {
      const r = await api.public.contact(form)
      setResult({ ok: true, msg: r.message })
      setForm(f => ({ ...f, message: '' }))
    } catch (err: unknown) {
      setResult({ ok: false, msg: (err as Error).message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Contact Us</h1>
        <p className="text-sm text-gray-500 mt-1">Have a question, feedback, or need help? We'd love to hear from you.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header strip */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Send us a message</p>
              <p className="text-white/70 text-xs">We reply within 24 hours</p>
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Your name *</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
                placeholder="Jane Smith" maxLength={120} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email *</label>
              <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
                placeholder="jane@company.com" maxLength={200} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Message *</label>
            <textarea required rows={6} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all resize-none"
              placeholder="Tell us what's on your mind…" maxLength={2000} />
            <p className="text-right text-xs text-gray-400 mt-1">{form.message.length}/2000</p>
          </div>

          {result && (
            <div className={`text-sm px-4 py-3 rounded-xl ${result.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {result.msg}
            </div>
          )}

          <button type="submit" disabled={submitting}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50 shadow-sm">
            {submitting ? 'Sending…' : 'Send message →'}
          </button>
        </form>
      </div>

      {/* Alt contact methods */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { icon: '✉️', label: 'Email', value: 'hello@raxteam.com', href: 'mailto:hello@raxteam.com' },
          { icon: '🐙', label: 'GitHub', value: 'github.com/raxteam', href: 'https://github.com/raxteam' },
        ].map(c => (
          <a key={c.label} href={c.href} target="_blank" rel="noreferrer"
            className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3.5 hover:border-indigo-300 hover:shadow-sm transition-all group">
            <span className="text-xl">{c.icon}</span>
            <div>
              <p className="text-xs font-semibold text-gray-500">{c.label}</p>
              <p className="text-sm text-gray-800 group-hover:text-indigo-600 transition-colors">{c.value}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
