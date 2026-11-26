import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api, type Skill, type SkillAsset, type Org, type SkillVersion, type SkillTestCase, type EvalResult } from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import UseWithAI from '../components/UseWithAI'

const ASSET_ICONS: Record<string, string> = {
  image: '🖼️', script: '📜', data: '📊', document: '📄',
}

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [skill, setSkill] = useState<Skill | null>(null)
  const [org, setOrg] = useState<Org | null>(null)
  const [userId, setUserId] = useState('')
  const [userRole, setUserRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState('')

  // Approval status
  const [approvalCount, setApprovalCount] = useState(0)
  const [approvalThreshold, setApprovalThreshold] = useState(1)
  const [hasVoted, setHasVoted] = useState(false)
  const [myVote, setMyVote] = useState<'approved' | 'rejected' | null>(null)
  const [approvalVotes, setApprovalVotes] = useState<Array<{ verdict: string; comment: string; reviewerName: string; isCurrentUser: boolean; createdAt: number }>>([])

  // Assets state
  const [assets, setAssets] = useState<SkillAsset[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [deletingAsset, setDeletingAsset] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Versions state
  const [versions, setVersions] = useState<SkillVersion[]>([])
  const [currentVersion, setCurrentVersion] = useState('')
  const [newVersionLabel, setNewVersionLabel] = useState('')
  const [newVersionChangelog, setNewVersionChangelog] = useState('')
  const [versionMsg, setVersionMsg] = useState('')
  const [versionLoading, setVersionLoading] = useState(false)

  // Evals state
  const [testCases, setTestCases] = useState<SkillTestCase[]>([])
  const [evalResults, setEvalResults] = useState<EvalResult[] | null>(null)
  const [evalRunning, setEvalRunning] = useState(false)
  const [evalSummary, setEvalSummary] = useState<{ passed: number; total: number } | null>(null)
  const [newCase, setNewCase] = useState({ description: '', expectedOutput: '', inputVars: '' })
  const [addingCase, setAddingCase] = useState(false)
  const [evalMsg, setEvalMsg] = useState('')

  // Share state
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{ title: string; body: string; onConfirm: () => void } | null>(null)

  function loadApprovalStatus(skillId: string): Promise<void> {
    return api.skills.approvalStatus(skillId).then(s => {
      setApprovalCount(s.approvalCount)
      setApprovalThreshold(s.threshold)
      setHasVoted(s.hasVoted)
      setMyVote(s.myVote)
      setApprovalVotes(s.votes)
    }).catch(() => {})
  }

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.skills.get(id).then(setSkill).catch(() => navigate('/skills')),
      api.me().then(r => { setOrg(r.org); setUserId(r.user.id); setUserRole(r.user.role) }),
      api.assets.list(id).then(r => setAssets(r.assets)).catch(() => {}),
      api.versions.list(id).then(r => { setVersions(r.versions); setCurrentVersion(r.current) }).catch(() => {}),
      api.evals.list(id).then(r => setTestCases(r.cases)).catch(() => {}),
      loadApprovalStatus(id),
    ]).finally(() => setLoading(false))
  }, [id])

  async function handleSnapshot() {
    if (!id || !newVersionLabel.trim()) return
    setVersionLoading(true); setVersionMsg('')
    try {
      const v = await api.versions.create(id, newVersionLabel.trim(), newVersionChangelog)
      setVersions(prev => [v, ...prev])
      setNewVersionLabel(''); setNewVersionChangelog('')
      setVersionMsg(`Saved as ${v.version}`)
    } catch (e: unknown) { setVersionMsg((e as Error).message) }
    finally { setVersionLoading(false) }
  }

  async function handlePromote(version: string) {
    if (!id || !confirm(`Promote "${version}" to active template? Skill will return to draft.`)) return
    setVersionLoading(true); setVersionMsg('')
    try {
      await api.versions.promote(id, version)
      setCurrentVersion(version)
      setSkill(s => s ? { ...s, version, status: 'draft' } : s)
      setVersionMsg(`"${version}" is now active. Resubmit for review.`)
    } catch (e: unknown) { setVersionMsg((e as Error).message) }
    finally { setVersionLoading(false) }
  }

  async function handleDeleteVersion(version: string) {
    if (!id || !confirm(`Delete version "${version}"?`)) return
    await api.versions.remove(id, version)
    setVersions(prev => prev.filter(v => v.version !== version))
  }

  async function handleRunEvals() {
    if (!id) return
    setEvalRunning(true); setEvalMsg('')
    try {
      const res = await api.evals.runAll(id)
      setEvalResults(res.results)
      setEvalSummary({ passed: res.passed, total: res.total })
      setTestCases(prev => prev.map(tc => {
        const r = res.results.find(r => r.testCaseId === tc.id)
        return r ? { ...tc, lastRun: r } : tc
      }))
    } catch (e: unknown) { setEvalMsg((e as Error).message) }
    finally { setEvalRunning(false) }
  }

  async function handleAddCase() {
    if (!id || !newCase.expectedOutput.trim()) return
    setAddingCase(true); setEvalMsg('')
    try {
      let inputVars: Record<string, string> = {}
      if (newCase.inputVars.trim()) inputVars = JSON.parse(newCase.inputVars)
      const tc = await api.evals.create(id, { description: newCase.description, inputVars, expectedOutput: newCase.expectedOutput })
      setTestCases(prev => [tc, ...prev])
      setNewCase({ description: '', expectedOutput: '', inputVars: '' })
    } catch (e: unknown) { setEvalMsg((e as Error).message) }
    finally { setAddingCase(false) }
  }

  async function handleDeleteCase(caseId: string) {
    if (!id || !confirm('Delete this test case?')) return
    await api.evals.remove(id, caseId)
    setTestCases(prev => prev.filter(tc => tc.id !== caseId))
    setEvalResults(prev => prev ? prev.filter(r => r.testCaseId !== caseId) : prev)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !id) return
    setUploading(true); setUploadError('')
    try {
      const { asset } = await api.assets.upload(id, file)
      setAssets(prev => [...prev, asset])
    } catch (err: unknown) {
      setUploadError((err as Error).message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDeleteAsset(assetId: string) {
    if (!id || !confirm('Delete this asset and its RAG chunks?')) return
    setDeletingAsset(assetId)
    try {
      await api.assets.delete(id, assetId)
      setAssets(prev => prev.filter(a => a.id !== assetId))
    } catch (err: unknown) {
      setUploadError((err as Error).message)
    } finally {
      setDeletingAsset(null)
    }
  }

  async function generateShare() {
    if (!skill) return
    setShareLoading(true)
    try {
      const r = await api.share.generate(skill.id)
      setShareToken(r.shareToken)
      const url = `${window.location.origin}/s/${r.shareToken}`
      await navigator.clipboard.writeText(url)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2500)
    } catch (e: unknown) {
      setMessage((e as Error).message)
    } finally {
      setShareLoading(false)
    }
  }

  async function revokeShare() {
    if (!skill) return
    await api.share.revoke(skill.id).catch(() => {})
    setShareToken(null)
  }

  async function deleteSkill() {
    if (!skill) return
    setActionLoading(true)
    try {
      await api.skills.delete(skill.id)
      navigate('/skills')
    } catch (e: unknown) {
      setMessage((e as Error).message)
      setActionLoading(false)
    }
  }

  async function doAction(action: 'submit' | 'approve' | 'reject' | 'revert' | 'unapprove') {
    if (!skill) return
    setActionLoading(true)
    setMessage('')
    try {
      if (action === 'submit') {
        await api.skills.submit(skill.id)
      } else if (action === 'approve') {
        await api.skills.approve(skill.id, comment)
      } else if (action === 'reject') {
        await api.skills.reject(skill.id, comment)
      } else if (action === 'unapprove') {
        await api.skills.unapprove(skill.id)
      } else {
        await api.skills.revert(skill.id)
      }
      const refreshed = await api.skills.get(skill.id)
      setSkill(refreshed)
      loadApprovalStatus(skill.id)
      setComment('')
      setMessage(
        action === 'approve' ? 'Skill approved.' :
        action === 'reject' ? 'Skill rejected.' :
        action === 'unapprove' ? 'Vote withdrawn.' :
        action === 'revert' ? 'Reverted to draft — author can now edit and resubmit.' :
        'Submitted for review.'
      )
    } catch (e: unknown) {
      setMessage((e as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return (
    <div className="p-8 flex items-center gap-3 text-sm text-gray-400">
      <div className="w-4 h-4 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      Loading skill…
    </div>
  )
  if (!skill) return null

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      {/* Back nav */}
      <div className="flex items-center justify-between mb-6">
        <Link
          to="/skills"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-brand-600 transition-colors group"
        >
          <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Skills
        </Link>
        <div className="flex items-center gap-2">
          {/* Share button */}
          <div className="relative">
            <button
              onClick={shareToken ? () => { const url=`${window.location.origin}/s/${shareToken}`; navigator.clipboard.writeText(url); setShareCopied(true); setTimeout(()=>setShareCopied(false),2500) } : generateShare}
              disabled={shareLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 hover:border-brand-300 hover:bg-brand-50 text-gray-600 hover:text-brand-700 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              {shareCopied ? 'Copied!' : shareToken ? 'Copy link' : 'Share'}
            </button>
            {shareToken && (
              <button onClick={revokeShare} className="absolute -top-1 -right-1 w-4 h-4 bg-red-100 hover:bg-red-200 text-red-600 rounded-full text-xs flex items-center justify-center" title="Revoke link">×</button>
            )}
          </div>

          {skill.status !== 'approved' && skill.authorId === userId && (
            <button
              onClick={() => setConfirmModal({
                title: 'Delete skill?',
                body: `"${skill.name}" will be permanently deleted. This cannot be undone.`,
                onConfirm: deleteSkill,
              })}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden mb-4">
        {/* Header strip */}
        <div className="px-6 pt-6 pb-5 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">{skill.name}</h1>
                <StatusBadge status={skill.status} />
              </div>
              <p className="text-sm text-gray-500 leading-relaxed mb-2">{skill.description}</p>
              {skill.authorName && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <div className="w-4 h-4 rounded-full bg-brand-100 flex items-center justify-center text-[9px] font-bold text-brand-600">
                    {skill.authorName[0]?.toUpperCase()}
                  </div>
                  <span>by <span className="text-gray-600 font-medium">{skill.authorName}</span></span>
                </div>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1.5 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="font-semibold text-gray-700">{skill.useCount}</span> uses
              </div>
              <span className="capitalize bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">{skill.visibility}</span>
              <span className="font-mono text-gray-400">v{skill.version ?? '1.0.0'}</span>
            </div>
          </div>
        </div>

        {/* Prompt Template */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Prompt Template</p>
            <div className="flex items-center gap-3">
              <UseWithAI
                skill={skill}
                shareUrl={shareToken ? `${window.location.origin}/s/${shareToken}` : window.location.href}
              />
              <button
                onClick={() => navigator.clipboard.writeText(skill.promptTemplate)}
                className="text-xs text-brand-500 hover:text-brand-700 flex items-center gap-1 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </button>
            </div>
          </div>
          <pre className="p-4 bg-slate-950 rounded-xl text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed border border-slate-800 overflow-x-auto">
            {skill.promptTemplate}
          </pre>
        </div>

        {/* Metadata */}
        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">Triggers</p>
            <div className="flex flex-wrap gap-1.5">
              {skill.triggers.length ? skill.triggers.map(t => (
                <span key={t} className="bg-brand-50 text-brand-700 border border-brand-100 px-2.5 py-0.5 rounded-full text-xs font-medium">{t}</span>
              )) : <span className="text-gray-400 text-xs italic">None configured</span>}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {skill.tags.length ? skill.tags.map(t => (
                <span key={t} className="bg-gray-100 text-gray-600 border border-gray-200 px-2.5 py-0.5 rounded-full text-xs font-medium">{t}</span>
              )) : <span className="text-gray-400 text-xs italic">None</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Assets / RAG panel */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden mb-4">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-violet-50 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Rich Assets & RAG</h2>
              <p className="text-xs text-gray-400">Images, scripts, documents — vectorized for semantic search</p>
            </div>
          </div>
          {org?.plan !== 'free' && (
            <span className="text-xs text-violet-600 font-semibold bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-full">Pro</span>
          )}
        </div>

        {org?.plan === 'free' ? (
          <div className="px-6 py-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Pro feature</p>
            <p className="text-xs text-gray-400 mb-4 max-w-xs mx-auto">Attach images, scripts, PDFs, and data files. They'll be chunked and vectorized for RAG-powered skill resolution.</p>
            <Link to="/upgrade" className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-brand-600 to-violet-600 text-white rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Upgrade to Pro
            </Link>
          </div>
        ) : (
          <div className="px-6 py-4">
            {uploadError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg mb-3">{uploadError}</div>
            )}

            {assets.length > 0 && (
              <div className="space-y-2 mb-4">
                {assets.map(asset => (
                  <div key={asset.id} className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
                    <span className="text-lg shrink-0">{ASSET_ICONS[asset.assetType] ?? '📎'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{asset.fileName}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {fmt(asset.sizeBytes)} · {asset.assetType}
                        {asset.chunkCount > 0 && ` · ${asset.chunkCount} chunks vectorized`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => api.assets.download(skill.id, asset.id, asset.fileName)}
                        className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                        title="Download"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteAsset(asset.id)}
                        disabled={deletingAsset === asset.id}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Delete asset"
                      >
                        {deletingAsset === asset.id
                          ? <div className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                          : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        }
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".txt,.md,.csv,.json,.js,.ts,.py,.html,.xml,.yaml,.yml,.png,.jpg,.jpeg,.webp,.gif"
              onChange={handleUpload}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-200 hover:border-brand-300 hover:bg-brand-50 rounded-xl text-sm text-gray-500 hover:text-brand-600 transition-all w-full justify-center disabled:opacity-50"
            >
              {uploading
                ? <><div className="w-4 h-4 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin" /> Uploading…</>
                : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg> Attach file</>
              }
            </button>
            <p className="text-[10px] text-gray-400 text-center mt-2">Images, scripts, documents, CSVs, JSON — up to 10 MB. Text files are chunked and vectorized for RAG.</p>
          </div>
        )}
      </div>

      {/* ── Versions panel ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden mb-4">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Version History</h2>
            <p className="text-xs text-gray-400">Snapshot the current template and promote older versions</p>
          </div>
          <span className="text-xs font-mono bg-brand-50 text-brand-700 border border-brand-200 px-2 py-0.5 rounded-full">
            current: {currentVersion || skill.version}
          </span>
        </div>
        <div className="px-6 py-4">
          {/* Snapshot form */}
          <div className="flex gap-2 mb-3 flex-wrap">
            <input
              value={newVersionLabel}
              onChange={e => setNewVersionLabel(e.target.value)}
              placeholder="Label (e.g. v2)"
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs w-28 focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <input
              value={newVersionChangelog}
              onChange={e => setNewVersionChangelog(e.target.value)}
              placeholder="What changed? (optional)"
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs flex-1 min-w-40 focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <button
              onClick={handleSnapshot}
              disabled={versionLoading || !newVersionLabel.trim()}
              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg disabled:opacity-40 transition-colors"
            >
              {versionLoading ? 'Saving…' : 'Save snapshot'}
            </button>
          </div>
          {versionMsg && <p className="text-xs text-brand-600 mb-3">{versionMsg}</p>}

          {versions.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">No saved versions yet. Snapshot the current template to start tracking history.</p>
          ) : (
            <div className="space-y-1.5">
              {versions.map(v => (
                <div key={v.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
                  <code className="text-xs font-mono font-bold text-brand-700 shrink-0">{v.version}</code>
                  {v.version === (currentVersion || skill.version) && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">active</span>
                  )}
                  <p className="text-xs text-gray-500 flex-1 truncate">{v.changelog || <span className="text-gray-300">—</span>}</p>
                  <p className="text-[10px] text-gray-400 shrink-0">{new Date(v.createdAt).toLocaleDateString()}</p>
                  <button
                    onClick={() => handlePromote(v.version)}
                    disabled={v.version === (currentVersion || skill.version)}
                    className="text-[10px] px-2 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg border border-brand-200 disabled:opacity-30 transition-colors"
                  >
                    Promote
                  </button>
                  <button
                    onClick={() => handleDeleteVersion(v.version)}
                    className="text-gray-300 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Evals panel ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden mb-4">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Eval Test Cases</h2>
            <p className="text-xs text-gray-400">Run regression tests before approving a new version</p>
          </div>
          <button
            onClick={handleRunEvals}
            disabled={evalRunning || testCases.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg disabled:opacity-40 transition-colors"
          >
            {evalRunning
              ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Running…</>
              : '▶ Run all'}
          </button>
        </div>

        <div className="px-6 py-4">
          {evalSummary && (
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg mb-4 font-semibold ${
              evalSummary.passed === evalSummary.total
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {evalSummary.passed === evalSummary.total ? '✓' : '✗'}&nbsp;
              {evalSummary.passed}/{evalSummary.total} test cases passed
            </div>
          )}
          {evalMsg && <p className="text-xs text-red-500 mb-3">{evalMsg}</p>}

          {/* Test case list */}
          {testCases.length > 0 && (
            <div className="space-y-2 mb-4">
              {testCases.map(tc => {
                const run = evalResults?.find(r => r.testCaseId === tc.id) ?? tc.lastRun
                return (
                  <div key={tc.id} className={`px-3 py-2.5 rounded-xl border text-xs ${
                    run ? (run.passed ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200') : 'bg-gray-50 border-gray-100'
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-700 truncate">{tc.description || <span className="text-gray-400">(no description)</span>}</p>
                        <p className="text-gray-400 mt-0.5 truncate">Expected: {tc.expectedOutput.slice(0, 80)}</p>
                        {Object.keys(tc.inputVars ?? {}).length > 0 && (
                          <p className="text-gray-400 truncate">Vars: {JSON.stringify(tc.inputVars)}</p>
                        )}
                        {run && !run.passed && (
                          <p className="text-red-500 mt-1 truncate">Got: {run.rendered.slice(0, 80)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {run && (
                          <span className={`font-bold ${run.passed ? 'text-emerald-600' : 'text-red-500'}`}>
                            {run.passed ? '✓' : '✗'} {Math.round((run.score ?? 0) * 100)}%
                          </span>
                        )}
                        <button onClick={() => handleDeleteCase(tc.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Add test case form */}
          <div className="border border-gray-200 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-600">Add test case</p>
            <input
              value={newCase.description}
              onChange={e => setNewCase(p => ({ ...p, description: e.target.value }))}
              placeholder="Description (optional)"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <textarea
              value={newCase.expectedOutput}
              onChange={e => setNewCase(p => ({ ...p, expectedOutput: e.target.value }))}
              placeholder="Expected output or keyword the rendered template must contain *"
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
            />
            <input
              value={newCase.inputVars}
              onChange={e => setNewCase(p => ({ ...p, inputVars: e.target.value }))}
              placeholder='Input vars JSON (optional) e.g. {"name":"Alice"}'
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <button
              onClick={handleAddCase}
              disabled={addingCase || !newCase.expectedOutput.trim()}
              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg disabled:opacity-40 transition-colors"
            >
              {addingCase ? 'Adding…' : '+ Add test case'}
            </button>
          </div>
        </div>
      </div>

      {/* Actions card */}
      {(() => {
        const isAuthor = skill.authorId === userId
        const isReviewer = ['admin', 'curator'].includes(userRole)
        return (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-6 fade-in">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-md bg-brand-50 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-gray-800">Actions</h2>
            </div>

            {/* Comment field for reviewers on pending skills */}
            {skill.status === 'pending' && isReviewer && (
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Add a review comment (optional)"
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 placeholder-gray-400 resize-none transition-all"
              />
            )}

            {message && (
              <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg mb-4 fade-in ${
                message.toLowerCase().includes('reject') || message.toLowerCase().includes('error')
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}>
                {message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5 flex-wrap">
              {/* No available actions */}
              {skill.status === 'draft' && !isAuthor && (
                <p className="text-sm text-gray-400 italic self-center">Only the author can edit or submit this draft.</p>
              )}
              {skill.status === 'pending' && !isAuthor && !isReviewer && (
                <p className="text-sm text-gray-400 italic self-center">
                  Awaiting review. Your account role (<span className="font-medium text-gray-600">{userRole || 'unknown'}</span>) does not have approve/reject access — curator or admin role required.
                </p>
              )}
              {skill.status === 'approved' && !isReviewer && (
                <p className="text-sm text-gray-400 italic self-center">This skill is published. Curator or admin role required to revert.</p>
              )}

              {/* Author: submit draft for review */}
              {skill.status === 'draft' && isAuthor && (
                <button
                  onClick={() => doAction('submit')}
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 h-11 bg-brand-600 hover:bg-brand-500 active:bg-brand-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-all shadow-sm shadow-brand-200"
                >
                  {actionLoading && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Submit for Review
                </button>
              )}

              {/* Approval progress — shown to reviewers on pending skills */}
              {skill.status === 'pending' && isReviewer && (
                <div className="w-full mb-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-500 font-medium">Approvals</span>
                    <span className={`text-xs font-semibold ${approvalCount >= approvalThreshold ? 'text-emerald-600' : 'text-gray-600'}`}>
                      {approvalCount} / {approvalThreshold}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (approvalCount / approvalThreshold) * 100)}%` }}
                    />
                  </div>
                  {approvalVotes.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {approvalVotes.map((v) => (
                        <div key={v.createdAt} className="flex items-center gap-2 text-xs text-gray-500">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.verdict === 'approved' ? 'bg-emerald-500' : 'bg-red-400'}`} />
                          <span className="font-medium text-gray-700">{v.reviewerName}</span>
                          {v.isCurrentUser && (
                            <span className="text-[10px] bg-brand-50 text-brand-600 border border-brand-100 px-1.5 py-px rounded-full font-semibold">you</span>
                          )}
                          <span className={v.verdict === 'approved' ? 'text-emerald-600' : 'text-red-500'}>{v.verdict}</span>
                          {v.comment && <span className="text-gray-400 truncate max-w-[160px]">· {v.comment}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Reviewer: approve / reject on pending skills (not self-approving, not already voted) */}
              {skill.status === 'pending' && isReviewer && !isAuthor && !hasVoted && (
                <>
                  <button
                    onClick={() => doAction('approve')}
                    disabled={actionLoading}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 h-11 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-all shadow-sm"
                  >
                    {actionLoading && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    Approve
                  </button>
                  <button
                    onClick={() => doAction('reject')}
                    disabled={actionLoading}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 h-11 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-all shadow-sm"
                  >
                    Reject
                  </button>
                </>
              )}

              {/* Already voted — show unapprove if they approved and skill is still pending */}
              {skill.status === 'pending' && isReviewer && !isAuthor && hasVoted && (
                myVote === 'approved' ? (
                  <button
                    onClick={() => doAction('unapprove')}
                    disabled={actionLoading}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 h-11 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-all shadow-sm"
                  >
                    {actionLoading && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    Withdraw Approval
                  </button>
                ) : (
                  <p className="text-sm text-gray-400 italic self-center">
                    You've already reviewed this skill.
                  </p>
                )
              )}

              {/* Author is the reviewer — inform them they cannot self-approve */}
              {skill.status === 'pending' && isAuthor && (
                <p className="text-sm text-gray-400 italic self-center">
                  Awaiting review — you cannot approve your own skill.
                </p>
              )}

              {/* Reviewer: revert approved skill back to draft */}
              {skill.status === 'approved' && isReviewer && (
                <button
                  onClick={() => setConfirmModal({
                    title: 'Revert to draft?',
                    body: 'The skill will be unpublished and the author will need to edit and resubmit for review.',
                    onConfirm: () => doAction('revert'),
                  })}
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 h-11 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-all shadow-sm"
                >
                  {actionLoading && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Revert to Draft
                </button>
              )}
            </div>
          </div>
        )
      })()}

      {/* Confirm modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-1">{confirmModal.title}</h3>
            <p className="text-sm text-gray-500 text-center mb-6">{confirmModal.body}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { confirmModal.onConfirm(); setConfirmModal(null) }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
