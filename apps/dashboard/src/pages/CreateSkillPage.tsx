import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api, type Org } from '../lib/api'

export default function CreateSkillPage() {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [org, setOrg] = useState<Org | null>(null)

  useEffect(() => {
    api.me().then(r => setOrg(r.org)).catch(() => {})
  }, [])
  const [form, setForm] = useState({
    name: '',
    description: '',
    promptTemplate: '',
    triggers: '',
    tags: '',
    visibility: 'private' as 'private' | 'shared' | 'public',
    tokenEstimate: '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const skill = await api.skills.create({
        name: form.name,
        description: form.description,
        promptTemplate: form.promptTemplate,
        triggers: form.triggers.split(',').map(s => s.trim()).filter(Boolean),
        tags: form.tags.split(',').map(s => s.trim()).filter(Boolean),
        visibility: form.visibility,
        tokenEstimate: form.tokenEstimate ? parseInt(form.tokenEstimate) : 0,
      })
      navigate(`/skills/${skill.id}`)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const labelClass = 'block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5'
  const inputClass = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 placeholder-gray-400 transition-all duration-150'

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      {/* Back nav */}
      <Link
        to="/skills"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-brand-600 transition-colors mb-6 group"
      >
        <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Skills
      </Link>

      {/* Page title */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">New Skill</h1>
        <p className="text-sm text-gray-500 mt-1">Define a reusable AI prompt skill for your team</p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        {/* Identity section */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-6 space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <div className="w-5 h-5 rounded bg-brand-50 flex items-center justify-center">
              <svg className="w-3 h-3 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-gray-700">Identity</h2>
          </div>

          <div>
            <label className={labelClass}>Name *</label>
            <input
              required
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className={inputClass}
              placeholder="e.g. Summarize PR"
            />
          </div>

          <div>
            <label className={labelClass}>Description *</label>
            <textarea
              required
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={2}
              className={inputClass}
              placeholder="Summarizes a GitHub pull request into bullet points"
            />
          </div>
        </div>

        {/* Prompt section */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-6 space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <div className="w-5 h-5 rounded bg-violet-50 flex items-center justify-center">
              <svg className="w-3 h-3 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-gray-700">Prompt Template</h2>
          </div>

          <div>
            <label className={labelClass}>Template *</label>
            <textarea
              required
              value={form.promptTemplate}
              onChange={e => set('promptTemplate', e.target.value)}
              rows={6}
              className={`${inputClass} font-mono text-xs leading-relaxed bg-slate-50 border-slate-200`}
              placeholder={"Summarize this PR in 5 bullet points:\n\nTitle: {{title}}\nBody: {{body}}"}
            />
            <p className="mt-1.5 text-xs text-gray-400 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Use <code className="font-mono bg-gray-100 px-1 rounded text-gray-600 mx-0.5">{'{{variableName}}'}</code> for template variables
            </p>
          </div>
        </div>

        {/* Metadata section */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-6 space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <div className="w-5 h-5 rounded bg-emerald-50 flex items-center justify-center">
              <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-gray-700">Metadata</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Triggers</label>
              <input
                value={form.triggers}
                onChange={e => set('triggers', e.target.value)}
                className={inputClass}
                placeholder="summarize pr, pr summary"
              />
              <p className="mt-1 text-xs text-gray-400">Comma-separated</p>
            </div>
            <div>
              <label className={labelClass}>Tags</label>
              <input
                value={form.tags}
                onChange={e => set('tags', e.target.value)}
                className={inputClass}
                placeholder="github, pr, review"
              />
              <p className="mt-1 text-xs text-gray-400">Comma-separated</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Visibility</label>
              <select
                value={form.visibility}
                onChange={e => set('visibility', e.target.value)}
                className={inputClass}
              >
                <option value="private">Private</option>
                <option value="shared">Shared</option>
                <option value="public">Public</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Token Estimate</label>
              <input
                type="number"
                value={form.tokenEstimate}
                onChange={e => set('tokenEstimate', e.target.value)}
                className={inputClass}
                placeholder="200"
              />
            </div>
          </div>
        </div>

        {/* Premium feature callout — shown for free tier */}
        {org?.plan === 'free' && (
          <div className="rounded-2xl overflow-hidden border border-violet-200 shadow-sm">
            {/* Header */}
            <div className="bg-gradient-to-r from-brand-600 to-violet-600 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-none">Unlock Pro skills</p>
                  <p className="text-xs text-white/70 mt-0.5">Everything you need to build production-grade AI skills</p>
                </div>
              </div>
              <Link
                to="/upgrade"
                className="shrink-0 px-3.5 py-1.5 bg-white text-brand-700 rounded-lg text-xs font-bold hover:bg-brand-50 transition-colors"
              >
                Upgrade →
              </Link>
            </div>

            {/* Feature grid */}
            <div className="bg-white px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  icon: '📎',
                  title: 'Rich Assets & RAG',
                  desc: 'Attach images, PDFs, scripts, and data files. Each is chunked and vectorized — your LLM gets relevant context on every resolve call.',
                  locked: true,
                },
                {
                  icon: '🔍',
                  title: 'Higher-accuracy matching',
                  desc: '768-dim bge-base embeddings (vs 384-dim free) with a tighter 0.85 confidence threshold — fewer false positives.',
                  locked: true,
                },
                {
                  icon: '♾️',
                  title: 'Unlimited skills & calls',
                  desc: 'No 25-skill cap, no 500 resolver calls/month limit. Scale as your team and usage grows.',
                  locked: true,
                },
                {
                  icon: '👥',
                  title: 'Unlimited team members',
                  desc: 'Invite your whole engineering or product team. Free tier is capped at 5 seats.',
                  locked: true,
                },
                {
                  icon: '🌐',
                  title: 'Shared & public marketplace',
                  desc: 'Publish skills across orgs or to the public RaxTeam registry — free is private-only.',
                  locked: true,
                },
                {
                  icon: '⚡',
                  title: 'Priority embedding queue',
                  desc: 'Skills are vectorized immediately on approval instead of waiting for the async batch queue.',
                  locked: false,
                },
              ].map(feature => (
                <div key={feature.title} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <span className="text-xl shrink-0 mt-0.5">{feature.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className="text-xs font-semibold text-gray-800">{feature.title}</p>
                      {feature.locked && (
                        <svg className="w-3 h-3 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 leading-relaxed">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer CTA */}
            <div className="bg-violet-50 border-t border-violet-100 px-5 py-3 flex items-center justify-between">
              <p className="text-xs text-violet-600 font-medium">Pro starts at <strong>$19/mo</strong> billed annually</p>
              <Link
                to="/upgrade"
                className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors"
              >
                See all plans
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 fade-in">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex flex-col sm:flex-row gap-3 pt-1 pb-4">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 px-6 py-2.5 h-11 bg-brand-600 hover:bg-brand-500 active:bg-brand-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-all shadow-sm shadow-brand-200"
          >
            {saving && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {saving ? 'Creating…' : 'Create Skill'}
          </button>
          <Link
            to="/skills"
            className="flex items-center justify-center px-6 py-2.5 h-11 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 rounded-lg text-sm font-medium border border-gray-200 transition-all"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
