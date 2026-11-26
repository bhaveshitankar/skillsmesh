import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Skill, type Org } from '../lib/api'

type Variable = { name: string; value: string }

function extractVars(template: string): string[] {
  const matches = template.matchAll(/\{\{(\w+)\}\}/g)
  return [...new Set([...matches].map(m => m[1]))]
}

function renderPrompt(template: string, vars: Variable[]): string {
  return vars.reduce(
    (t, v) => t.replaceAll(`{{${v.name}}}`, v.value || `{{${v.name}}}`),
    template,
  )
}

type RunResult = { content: string; model: string; tokensUsed?: number }
type RunMode = 'raxteam' | 'byok'

export default function PlaygroundPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [skill, setSkill] = useState<Skill | null>(null)
  const [vars, setVars] = useState<Variable[]>([])
  const [rendered, setRendered] = useState('')
  const [tab, setTab] = useState<'vars' | 'raw'>('vars')

  // Run mode
  const [runMode, setRunMode] = useState<RunMode>('raxteam')

  // BYOK
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem('pg_endpoint') ?? 'https://api.openai.com/v1')
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('pg_apikey') ?? '')
  const [model, setModel] = useState(() => localStorage.getItem('pg_model') ?? 'gpt-4o-mini')
  const [showConfig, setShowConfig] = useState(false)

  // Free tier usage
  const [freeUsed, setFreeUsed] = useState(0)
  const [freeLimit, setFreeLimit] = useState(5)
  const [isPro, setIsPro] = useState(false)

  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [error, setError] = useState('')
  const [org, setOrg] = useState<Org | null>(null)

  useEffect(() => {
    api.skills.list().then(r => setSkills(r.skills.filter(s => s.status === 'approved'))).catch(() => {})
    api.me().then(r => setOrg(r.org)).catch(() => {})
    api.playground.usage().then(r => {
      setFreeUsed(r.requestsUsed)
      setFreeLimit(r.limit)
      setIsPro(r.isPro)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedId) { setSkill(null); setVars([]); setRendered(''); return }
    const s = skills.find(x => x.id === selectedId) ?? null
    setSkill(s)
    if (s) {
      const names = extractVars(s.promptTemplate)
      setVars(names.map(name => ({ name, value: '' })))
      setRendered(s.promptTemplate)
    }
  }, [selectedId, skills])

  useEffect(() => {
    if (skill) setRendered(renderPrompt(skill.promptTemplate, vars))
  }, [vars, skill])

  function setVar(name: string, value: string) {
    setVars(v => v.map(x => x.name === name ? { ...x, value } : x))
  }

  function saveConfig() {
    localStorage.setItem('pg_endpoint', endpoint)
    localStorage.setItem('pg_apikey', apiKey)
    localStorage.setItem('pg_model', model)
    setShowConfig(false)
  }

  const freeRemaining = Math.max(0, freeLimit - freeUsed)
  const freeExhausted = freeRemaining === 0

  async function run() {
    if (!rendered.trim()) return
    setRunning(true)
    setResult(null)
    setError('')

    try {
      if (runMode === 'raxteam') {
        const data = await api.playground.run(rendered)
        setFreeUsed(data.requestsUsed)
        setFreeLimit(data.limit)
        setResult({ content: data.reply, model: 'Llama 3.3 70B (RaxTeam)' })
        if (skill) {
          api.logUsage({
            skillId: skill.id,
            queryText: rendered.slice(0, 200),
            matchScore: 1,
            tokensUsed: 0,
            tokensSaved: 0,
            outcome: 'used',
          }).catch(() => {})
        }
      } else {
        if (!apiKey) { setShowConfig(true); setRunning(false); return }
        const res = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: rendered }],
          }),
        })
        if (!res.ok) {
          const e = await res.json().catch(() => ({})) as { error?: { message?: string } }
          throw new Error(e?.error?.message ?? res.statusText)
        }
        const data = await res.json() as {
          choices: { message: { content: string } }[]
          model: string
          usage?: { total_tokens: number }
        }
        setResult({
          content: data.choices[0]?.message?.content ?? '',
          model: data.model,
          tokensUsed: data.usage?.total_tokens,
        })
        if (skill) {
          api.logUsage({
            skillId: skill.id,
            queryText: rendered.slice(0, 200),
            matchScore: 1,
            tokensUsed: data.usage?.total_tokens ?? 0,
            tokensSaved: skill.tokenEstimate > 0 ? Math.max(0, skill.tokenEstimate - (data.usage?.total_tokens ?? 0)) : 0,
            outcome: 'used',
          }).catch(() => {})
        }
      }
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const tabBtn = (t: 'vars' | 'raw') =>
    `px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 ${
      tab === t
        ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
        : 'text-gray-500 hover:text-gray-700'
    }`

  const inputClass = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 placeholder-gray-400 transition-all duration-150'

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f8f9fb]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5 border-b border-gray-200 bg-white shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Playground</h1>
          <p className="text-xs text-gray-500 mt-0.5">Run approved skills against an AI endpoint</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode selector */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
            <button
              onClick={() => { setRunMode('raxteam'); setShowConfig(false) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                runMode === 'raxteam'
                  ? 'bg-white text-brand-700 shadow-sm border border-brand-100'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              RaxTeam AI
              {runMode === 'raxteam' && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  freeExhausted ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {freeExhausted ? 'limit reached' : `${freeRemaining}/${freeLimit} left`}
                </span>
              )}
            </button>
            <button
              onClick={() => setRunMode('byok')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                runMode === 'byok'
                  ? 'bg-white text-gray-800 shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              BYOK
              {runMode === 'byok' && apiKey && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
              {runMode === 'byok' && !apiKey && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              )}
            </button>
          </div>

          {/* BYOK config button */}
          {runMode === 'byok' && (
            <button
              onClick={() => setShowConfig(s => !s)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-all duration-150 ${
                apiKey
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {apiKey ? model : 'Configure'}
            </button>
          )}
        </div>
      </div>

      {/* RaxTeam AI info bar */}
      {runMode === 'raxteam' && (
        <div className={`px-4 md:px-8 py-2.5 shrink-0 flex items-center justify-between gap-4 text-xs border-b ${
          freeExhausted
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-brand-50 border-brand-100 text-brand-700'
        }`}>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {freeExhausted ? (
              <span>You've used all {freeLimit} free requests today. Resets at midnight UTC.</span>
            ) : (
              <span>
                <strong>{freeRemaining} of {freeLimit}</strong> free requests remaining today · Powered by Llama 3.3 70B via Cloudflare AI
              </span>
            )}
          </div>
          {freeExhausted && !isPro && (
            <Link to="/upgrade" className="font-bold whitespace-nowrap hover:underline">
              Upgrade for {isPro ? 'unlimited' : '50/day'} →
            </Link>
          )}
          {!freeExhausted && !isPro && (
            <Link to="/upgrade" className="font-semibold whitespace-nowrap opacity-70 hover:opacity-100">
              Pro: {50}/day →
            </Link>
          )}
        </div>
      )}

      {/* BYOK Config panel */}
      {showConfig && runMode === 'byok' && (
        <div className="px-4 md:px-8 py-4 md:py-5 bg-white border-b border-gray-200 slide-down shrink-0">
          <div className="max-w-3xl">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">AI Endpoint Configuration (BYOK)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5 block">Endpoint URL</label>
                <input
                  value={endpoint}
                  onChange={e => setEndpoint(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5 block">Model</label>
                <input
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder="gpt-4o-mini"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5 block">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-..."
                className={inputClass}
              />
              <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Stored in localStorage only — never sent to RaxTeam servers
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5 items-center">
              <button
                onClick={saveConfig}
                className="px-5 py-2 h-10 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-semibold transition-all shadow-sm"
              >
                Save Configuration
              </button>
              <button
                onClick={() => setShowConfig(false)}
                className="px-5 py-2 h-10 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-all"
              >
                Cancel
              </button>
              <span className="text-xs text-gray-400">Works with Claude, Groq, Mistral, Ollama, and any OpenAI-compatible endpoint</span>
            </div>
          </div>
        </div>
      )}

      {/* Main split pane */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-auto lg:overflow-hidden">
        {/* Left pane — skill selector + variables */}
        <div className="flex flex-col border-b lg:border-b-0 lg:border-r border-gray-200 overflow-hidden bg-white min-h-[300px] lg:min-h-0">
          {/* Pane header */}
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Skill &amp; Variables</span>
          </div>

          {/* Pro upsell banner — free tier only */}
          {org?.plan === 'free' && (
            <div className="shrink-0 mx-5 mt-3 rounded-xl overflow-hidden border border-violet-200 bg-gradient-to-br from-brand-600 to-violet-600">
              <div className="px-4 py-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚡</span>
                    <p className="text-xs font-bold text-white leading-tight">Upgrade to Pro</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold text-white/60 uppercase tracking-widest border border-white/20 px-1.5 py-0.5 rounded-full">Free</span>
                </div>
                <ul className="space-y-1 mb-3">
                  {[
                    'Attach images & docs to skills',
                    'RAG context on every resolve',
                    '768-dim embeddings (2× accuracy)',
                    'Unlimited skills & resolver calls',
                  ].map(f => (
                    <li key={f} className="flex items-center gap-1.5 text-[11px] text-white/85">
                      <svg className="w-3 h-3 text-white/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/upgrade"
                  className="flex items-center justify-center gap-1.5 w-full py-2 bg-white text-brand-700 rounded-lg text-xs font-bold hover:bg-brand-50 transition-colors"
                >
                  See Pro plans →
                </Link>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Skill selector */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Skill</label>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                className={`${inputClass} bg-gray-50`}
              >
                <option value="">Select an approved skill…</option>
                {skills.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {skill && (
              <>
                <p className="text-xs text-gray-500 leading-relaxed -mt-2 px-0.5">{skill.description}</p>

                {/* Tabs */}
                <div className="bg-gray-100 rounded-xl p-1 flex gap-1">
                  <button className={tabBtn('vars')} onClick={() => setTab('vars')}>Variables</button>
                  <button className={tabBtn('raw')} onClick={() => setTab('raw')}>Raw Template</button>
                </div>

                {tab === 'vars' ? (
                  <div className="space-y-4">
                    {vars.length === 0 ? (
                      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        No template variables in this skill
                      </div>
                    ) : vars.map(v => (
                      <div key={v.name}>
                        <label className="text-xs font-semibold text-brand-600 font-mono mb-1.5 block">{`{{${v.name}}}`}</label>
                        <textarea
                          rows={2}
                          value={v.value}
                          onChange={e => setVar(v.name, e.target.value)}
                          placeholder={`Enter ${v.name}…`}
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 resize-none placeholder-gray-400 transition-all"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <pre className="p-4 bg-slate-950 rounded-xl text-xs font-mono text-slate-300 whitespace-pre-wrap overflow-auto leading-relaxed border border-slate-800 max-h-80">
                    {skill.promptTemplate}
                  </pre>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right pane — rendered prompt + output */}
        <div className="flex flex-col overflow-hidden bg-[#f8f9fb]">
          {/* Pane header */}
          <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Rendered Prompt</span>
            <span className="text-xs text-gray-400">{rendered.length > 0 ? `${rendered.length} chars` : ''}</span>
          </div>

          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
            {/* Editable prompt textarea */}
            <div className="flex flex-col gap-1.5">
              <textarea
                value={rendered}
                onChange={e => setRendered(e.target.value)}
                placeholder="Select a skill on the left, or type a prompt directly…"
                className="w-full bg-slate-950 text-slate-200 border border-slate-800 rounded-xl px-4 py-3.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none leading-relaxed placeholder-slate-600 min-h-[180px] transition-all"
                rows={8}
              />
              <p className="text-xs text-gray-400 px-1">You can edit the rendered prompt before running</p>
            </div>

            {/* Run button */}
            {runMode === 'raxteam' && freeExhausted ? (
              <div className="flex flex-col items-center gap-3 py-4 bg-red-50 border border-red-200 rounded-xl px-5">
                <p className="text-sm font-semibold text-red-700 text-center">Daily limit reached</p>
                <p className="text-xs text-red-500 text-center">You've used all {freeLimit} free requests for today. Upgrade to Pro for {50}/day, or use BYOK mode.</p>
                <div className="flex gap-2">
                  <Link to="/upgrade" className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-semibold transition-colors">
                    Upgrade to Pro
                  </Link>
                  <button
                    onClick={() => setRunMode('byok')}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    Use BYOK
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={run}
                disabled={running || !rendered.trim()}
                className="flex items-center justify-center gap-2.5 w-full py-3.5 bg-brand-600 hover:bg-brand-500 active:bg-brand-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all duration-150 shadow-sm shadow-brand-200"
              >
                {running ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Running…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Run Skill
                    {runMode === 'raxteam' && (
                      <span className="text-xs font-normal opacity-75">· uses 1 free request</span>
                    )}
                  </>
                )}
              </button>
            )}

            {/* RAG nudge — shown when a skill is selected on free tier */}
            {org?.plan === 'free' && skill && !result && !running && (
              <div className="flex items-start gap-3 px-4 py-3 bg-violet-50 border border-violet-200 rounded-xl">
                <span className="text-lg shrink-0">🔍</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-violet-800 mb-0.5">Pro: run with RAG context</p>
                  <p className="text-[11px] text-violet-600 leading-relaxed">
                    On Pro, the resolver automatically retrieves relevant chunks from skill assets — images, PDFs, scripts — and injects them before your prompt for richer responses.
                  </p>
                </div>
                <Link to="/upgrade" className="shrink-0 text-[11px] font-bold text-brand-600 hover:text-brand-700 whitespace-nowrap pt-0.5">
                  Upgrade →
                </Link>
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

            {/* Result */}
            {result && (
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-card fade-in">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/80">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Response</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="font-mono text-gray-500">{result.model}</span>
                    {result.tokensUsed && (
                      <span className="flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        {result.tokensUsed} tokens
                      </span>
                    )}
                    <button
                      onClick={() => navigator.clipboard.writeText(result.content)}
                      className="flex items-center gap-1 text-brand-500 hover:text-brand-700 font-medium transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy
                    </button>
                  </div>
                </div>
                <div className="px-5 py-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{result.content}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
