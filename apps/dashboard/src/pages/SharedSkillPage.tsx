import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, type Skill } from '../lib/api'
import RaxTeamLogo from '../components/RaxTeamLogo'
import UseWithAI from '../components/UseWithAI'

export default function SharedSkillPage() {
  const { token, slug } = useParams<{ token?: string; slug?: string }>()
  const [related, setRelated] = useState<Array<{ seoSlug: string; name: string; description: string }>>([])
  const [skill, setSkill] = useState<Skill | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Collab edit state
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<Skill>>({})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    if (!token && !slug) return
    const load = slug
      ? api.public.librarySkill(slug).then(r => { setRelated(r.related); return r.skill as Skill })
      : api.public.sharedSkill(token!).then(r => r.skill)
    load
      .then(sk => { setSkill(sk); setDraft(sk); document.title = `${sk.name} – AI Prompt Template | RaxTeam` })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, slug])

  async function save() {
    if (!token || !skill) return
    setSaving(true); setSaveMsg('')
    try {
      const r = await api.public.collabEdit(token, {
        name: draft.name,
        description: draft.description,
        promptTemplate: draft.promptTemplate,
        tags: draft.tags,
        triggers: draft.triggers,
      })
      setSkill(r.skill)
      setDraft(r.skill)
      setEditing(false)
      setSaveMsg('Saved!')
    } catch (e: unknown) {
      setSaveMsg((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  )

  if (error || !skill) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-4xl">🔗</div>
      <h1 className="text-lg font-semibold text-gray-800">Link not found</h1>
      <p className="text-sm text-gray-500">{error || 'This share link may have been revoked.'}</p>
      <Link to="/" className="text-sm text-indigo-600 hover:underline">← Back to RaxTeam</Link>
    </div>
  )

  const isEditable = !slug && skill.status === 'draft'
  const isDraft = skill.status === 'draft'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Slim header */}
      <header className="border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <RaxTeamLogo size={28} />
          <span className="font-semibold text-gray-800 text-sm">RaxTeam</span>
        </Link>
        <div className="flex items-center gap-2">
          <UseWithAI skill={skill} shareUrl={slug ? `${window.location.origin}/library/${slug}.md` : window.location.origin + window.location.pathname} />
          <button
            onClick={copyLink}
            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
          >
            Copy link
          </button>
          <Link
            to="/login"
            className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto py-10 px-4 space-y-4">
        {/* Status badge */}
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${
            isDraft ? 'bg-amber-100 text-amber-700' :
            skill.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
            'bg-gray-100 text-gray-600'
          }`}>{skill.status}</span>
          {isEditable && (
            <span className="text-xs text-gray-400">· Anyone with this link can edit</span>
          )}
        </div>

        {/* Main card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            {editing ? (
              <input
                className="w-full text-xl font-bold text-gray-900 border-0 border-b-2 border-indigo-400 bg-transparent pb-1 focus:outline-none"
                value={draft.name ?? ''}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              />
            ) : (
              <h1 className="text-xl font-bold text-gray-900">{skill.name}</h1>
            )}

            {/* Tags */}
            {skill.tags && skill.tags.length > 0 && !editing && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {skill.tags.map(t => (
                  <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            )}
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Description</label>
              {editing ? (
                <textarea
                  rows={3}
                  className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                  value={draft.description ?? ''}
                  onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                />
              ) : (
                <p className="text-sm text-gray-700">{skill.description}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Prompt Template</label>
              {editing ? (
                <textarea
                  rows={10}
                  className="w-full text-sm font-mono text-gray-800 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y bg-gray-50"
                  value={draft.promptTemplate ?? ''}
                  onChange={e => setDraft(d => ({ ...d, promptTemplate: e.target.value }))}
                />
              ) : (
                <pre className="text-sm font-mono text-gray-800 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-xl p-4">{skill.promptTemplate}</pre>
              )}
            </div>

            {/* Stats row */}
            {!editing && (
              <div className="flex items-center gap-6 text-xs text-gray-400 pt-1">
                <span>👍 {skill.upvotes}</span>
                <span>📋 Used {skill.useCount}×</span>
                {skill.tokenEstimate > 0 && <span>~{skill.tokenEstimate} tokens</span>}
              </div>
            )}
          </div>

          {/* Action bar */}
          {isEditable && (
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center gap-3">
              {editing ? (
                <>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                  <button
                    onClick={() => { setEditing(false); setDraft(skill) }}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  {saveMsg && <span className="text-xs text-red-500">{saveMsg}</span>}
                </>
              ) : (
                <>
                  <button
                    onClick={() => setEditing(true)}
                    className="px-4 py-2 border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-sm font-medium text-gray-700 rounded-xl transition-colors"
                  >
                    Edit
                  </button>
                  {saveMsg && <span className="text-xs text-emerald-600">{saveMsg}</span>}
                </>
              )}
            </div>
          )}
        </div>

        {related.length > 0 && (
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Related prompt templates</h2>
            <ul className="space-y-2">
              {related.map(r => (
                <li key={r.seoSlug}>
                  <Link to={`/library/${r.seoSlug}`} className="text-sm text-indigo-600 hover:underline font-medium">{r.name}</Link>
                  <p className="text-xs text-gray-500 line-clamp-2">{r.description}</p>
                </li>
              ))}
            </ul>
            <Link to="/library" className="inline-block mt-3 text-xs text-indigo-600 hover:underline">Browse all prompt templates →</Link>
          </section>
        )}

        <p className="text-xs text-center text-gray-400">
          Shared via <a href="https://raxteam.com" className="text-indigo-500 hover:underline">RaxTeam</a> · <Link to="/login" className="text-indigo-500 hover:underline">Sign in to manage your skills</Link>
        </p>
      </div>
    </div>
  )
}
