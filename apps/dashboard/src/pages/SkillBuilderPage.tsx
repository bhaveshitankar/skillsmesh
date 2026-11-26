import { useState, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { api, type Org } from '../lib/api'

type GeneratedSkill = {
  name: string
  description: string
  promptTemplate: string
  triggers: string[]
  tags: string[]
}

type CreatedSkill = { id: string; name: string; slug: string; description: string; status: string }

export default function SkillBuilderPage() {
  const navigate = useNavigate()
  const [org, setOrg] = useState<Org | null>(null)
  const [step, setStep] = useState(1)
  const fileRef = useRef<HTMLInputElement>(null)

  // Step 1
  const [inputTab, setInputTab] = useState<'file' | 'url'>('file')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [topicFocus, setTopicFocus] = useState('')
  const [jobId, setJobId] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [charCount, setCharCount] = useState(0)
  const [step1Loading, setStep1Loading] = useState(false)
  const [step1Error, setStep1Error] = useState('')

  // Step 2
  const [skills, setSkills] = useState<GeneratedSkill[]>([])
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')

  // Step 3
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createdSkills, setCreatedSkills] = useState<CreatedSkill[]>([])

  useEffect(() => {
    api.me().then(({ org }) => setOrg(org)).catch(() => {})
  }, [])

  const isPro = !!(org && (org.plan === 'pro' || org.plan === 'enterprise' || (org.trialEndsAt && org.trialEndsAt > Date.now())))

  async function handleFileUpload() {
    if (!selectedFile) return
    setStep1Loading(true); setStep1Error('')
    try {
      const res = await api.skillBuilder.upload(selectedFile)
      setJobId(res.jobId); setPreviewText(res.text); setCharCount(res.charCount)
    } catch (e: unknown) {
      setStep1Error((e as Error).message)
    } finally {
      setStep1Loading(false)
    }
  }

  async function handleFetchUrl() {
    if (!urlInput) return
    setStep1Loading(true); setStep1Error('')
    try {
      const res = await api.skillBuilder.fromUrl(urlInput)
      setJobId(res.jobId); setPreviewText(res.text); setCharCount(res.charCount)
    } catch (e: unknown) {
      setStep1Error((e as Error).message)
    } finally {
      setStep1Loading(false)
    }
  }

  async function handleGenerate() {
    if (!jobId) return
    // flushSync guarantees step 2 + spinner are painted BEFORE the fetch starts
    flushSync(() => { setStep(2); setGenerating(true); setGenerateError('') })
    try {
      const res = await api.skillBuilder.generate(jobId, topicFocus || undefined)
      setSkills(res.skills)
      if (res.skills.length === 0) setGenerateError(res.error ?? 'No skills generated. Try re-uploading your content.')
    } catch (e: unknown) {
      setGenerateError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  function updateSkill(idx: number, field: keyof GeneratedSkill, value: string | string[]) {
    setSkills(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  function addBlankSkill() {
    setSkills(prev => [...prev, { name: '', description: '', promptTemplate: '', triggers: [], tags: [] }])
  }

  function removeSkill(idx: number) {
    setSkills(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleCreate() {
    if (skills.length === 0) return
    setCreating(true); setCreateError('')
    try {
      const res = await api.skillBuilder.create({ skills })
      setCreatedSkills(res.skills)
      setStep(3)
    } catch (e: unknown) {
      setCreateError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  function reset() {
    setStep(1); setSelectedFile(null); setUrlInput(''); setTopicFocus(''); setJobId('')
    setPreviewText(''); setCharCount(0); setSkills([])
    setCreatedSkills([]); setStep1Error(''); setGenerateError(''); setCreateError('')
  }

  if (!org) return (
    <div className="flex items-center justify-center min-h-full">
      <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!isPro) return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-white p-8 flex items-center justify-center">
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center max-w-md shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Skill Builder is a Pro feature</h2>
        <p className="text-gray-500 text-sm mb-6">Upload documents or links to auto-generate reusable AI skills and complete workflows.</p>
        <button onClick={() => navigate('/upgrade')} className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold transition-colors">
          Upgrade to Pro
        </button>
      </div>
    </div>
  )

  // Step indicator
  const steps = ['Input', 'Review Skills', 'Done']

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-white p-4 md:p-8">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Skill Builder</h1>
          <p className="text-gray-500 text-sm mt-1">Upload a document or URL to auto-generate AI skills and workflows.</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {steps.map((label, i) => {
            const num = i + 1
            const isActive = step === num
            const isDone = step > num
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={`flex items-center gap-2 ${isActive || isDone ? '' : 'opacity-40'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-brand-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {isDone ? '✓' : num}
                  </div>
                  <span className={`text-sm font-medium hidden sm:block ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
                </div>
                {i < steps.length - 1 && <div className="h-px w-6 bg-gray-200 mx-1" />}
              </div>
            )
          })}
        </div>

        {/* ── STEP 1: Input ── */}
        {step === 1 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            {/* Tabs */}
            <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
              {(['file', 'url'] as const).map(tab => (
                <button key={tab} onClick={() => setInputTab(tab)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${inputTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {tab === 'file' ? 'Upload File' : 'From URL'}
                </button>
              ))}
            </div>

            {inputTab === 'file' ? (
              <div>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-brand-300 hover:bg-brand-50/30 transition-all"
                >
                  <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  {selectedFile ? (
                    <p className="text-sm font-medium text-gray-700">{selectedFile.name}</p>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-gray-600">Drop a file or click to browse</p>
                      <p className="text-xs text-gray-400 mt-1">.txt, .md, .html, .csv — max 5MB</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.md,.html,.csv"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setSelectedFile(f); setPreviewText(''); setJobId('') } }}
                />
                {selectedFile && !jobId && (
                  <button onClick={handleFileUpload} disabled={step1Loading} className="mt-3 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors flex items-center gap-2">
                    {step1Loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    {step1Loading ? 'Extracting…' : 'Extract text'}
                  </button>
                )}
              </div>
            ) : (
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">URL</label>
                <div className="flex gap-2">
                  <input
                    value={urlInput}
                    onChange={e => { setUrlInput(e.target.value); setPreviewText(''); setJobId('') }}
                    placeholder="https://docs.example.com/api"
                    className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                  />
                  <button onClick={handleFetchUrl} disabled={step1Loading || !urlInput} className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors flex items-center gap-2 shrink-0">
                    {step1Loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    {step1Loading ? 'Fetching…' : 'Fetch Content'}
                  </button>
                </div>
              </div>
            )}

            {step1Error && <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{step1Error}</p>}

            {previewText && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Preview</p>
                  <p className="text-xs text-gray-400">{charCount.toLocaleString()} characters</p>
                </div>
                <pre className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs text-gray-700 whitespace-pre-wrap overflow-auto max-h-40 font-mono">
                  {previewText.slice(0, 500)}{previewText.length > 500 ? '…' : ''}
                </pre>
              </div>
            )}

            <div className="mt-5">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Topic Focus <span className="text-gray-400 normal-case font-normal">(optional)</span></label>
              <input
                value={topicFocus}
                onChange={e => setTopicFocus(e.target.value)}
                placeholder="e.g. customer support, code review"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={handleGenerate}
                disabled={!jobId || generating}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-brand-600 to-violet-600 hover:from-brand-500 hover:to-violet-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-all shadow-md"
              >
                Generate Skills →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Review Skills ── */}
        {step === 2 && (
          <div>
            {generating ? (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
                <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm font-medium text-gray-600">Analyzing content and generating skills…</p>
              </div>
            ) : (
              <>
                {generateError && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{generateError}</div>}
                <div className="space-y-4 mb-4">
                  {skills.map((skill, idx) => (
                    <div key={idx} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Skill {idx + 1}</p>
                        <button onClick={() => removeSkill(idx)} className="text-xs text-red-400 hover:text-red-600 transition-colors">Remove</button>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-semibold text-gray-500 mb-1 block">Name</label>
                          <input value={skill.name} onChange={e => updateSkill(idx, 'name', e.target.value)}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500 mb-1 block">Description</label>
                          <textarea rows={2} value={skill.description} onChange={e => updateSkill(idx, 'description', e.target.value)}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500 mb-1 block">Prompt Template</label>
                          <textarea rows={4} value={skill.promptTemplate} onChange={e => updateSkill(idx, 'promptTemplate', e.target.value)}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-semibold text-gray-500 mb-1 block">Triggers <span className="font-normal">(comma-separated)</span></label>
                            <input value={skill.triggers.join(', ')} onChange={e => updateSkill(idx, 'triggers', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-500 mb-1 block">Tags <span className="font-normal">(comma-separated)</span></label>
                            <input value={skill.tags.join(', ')} onChange={e => updateSkill(idx, 'tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={addBlankSkill} className="mb-5 flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  Add another skill
                </button>
                {createError && <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{createError}</p>}
                <div className="flex justify-between">
                  <button onClick={() => setStep(1)} className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">
                    ← Back
                  </button>
                  <button onClick={handleCreate} disabled={skills.length === 0 || creating} className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-brand-600 to-violet-600 hover:from-brand-500 hover:to-violet-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-all shadow-md">
                    {creating && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    {creating ? 'Creating…' : 'Create Skills →'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── STEP 3: Done ── */}
        {step === 3 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              {createdSkills.length} skill{createdSkills.length !== 1 ? 's' : ''} created!
            </h2>
            <p className="text-gray-500 text-sm mb-6">Your skills are saved as drafts. Use the Orchestrator Builder to chain them together.</p>

            {createdSkills.length > 0 && (
              <div className="text-left bg-gray-50 rounded-xl border border-gray-200 p-4 mb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Created Skills</p>
                <ul className="space-y-2">
                  {createdSkills.map(s => (
                    <li key={s.id}>
                      <Link to={`/skills/${s.id}`} className="text-sm text-brand-600 hover:text-brand-700 font-medium hover:underline">{s.name}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-center gap-3 flex-wrap">
              <button onClick={() => navigate('/orchestrator-builder')} className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold transition-colors">
                Build Orchestrator →
              </button>
              <button onClick={() => navigate('/skills')} className="px-5 py-2.5 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-sm font-medium transition-colors">
                View Skills →
              </button>
              <button onClick={reset} className="px-5 py-2.5 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-sm font-medium transition-colors">
                Build another →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
