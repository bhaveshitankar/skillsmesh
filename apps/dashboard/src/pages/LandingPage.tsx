import React, { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, isLoggedIn, type Skill } from '../lib/api'
import RaxTeamLogo from '../components/RaxTeamLogo'

// ─── Shimmer gradient style (shared across sections) ─────────────────────────
const shimmerStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #fff 0%, #c7d2fe 40%, #a78bfa 70%, #818cf8 100%)',
  backgroundSize: '200% auto',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  animation: 'shimmer 4s linear infinite',
}

// ─── Skill detail modal ───────────────────────────────────────────────────────
function SkillDetailModal({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)

  async function share() {
    setSharing(true)
    try {
      const url = `${window.location.origin}/s/pub-${skill.id}`
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } finally { setSharing(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-[#0d0f16] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-[#0d0f16] border-b border-white/8 px-6 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-white font-bold text-lg leading-snug">{skill.name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {skill.tags?.slice(0, 4).map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">{tag}</span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={share} disabled={sharing} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-white/15 hover:border-indigo-500/50 text-white/50 hover:text-indigo-300 rounded-lg transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              {copied ? 'Copied!' : 'Share'}
            </button>
            <button onClick={onClose} className="text-white/40 hover:text-white/80 text-xl mt-0.5">✕</button>
          </div>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1.5">About</p>
            <p className="text-white/70 text-sm leading-relaxed">{skill.description}</p>
          </div>
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1.5">Prompt Template</p>
            <pre className="bg-black/40 border border-white/8 rounded-xl p-4 text-xs text-indigo-200 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">{skill.promptTemplate}</pre>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-white/6">
            <div className="flex items-center gap-4 text-xs text-white/30">
              <span>▲ {skill.upvotes ?? 0}</span>
              <span>{skill.useCount ?? 0} uses</span>
              {skill.tokenEstimate > 0 && <span>~{skill.tokenEstimate} tokens</span>}
            </div>
            <a href="/login" className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors">Use in your org →</a>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Skill card ───────────────────────────────────────────────────────────────
function SkillCard({ skill, onClick }: { skill: Skill; onClick: () => void }) {
  const [votes, setVotes] = useState({ up: skill.upvotes ?? 0, down: skill.downvotes ?? 0 })
  const [voted, setVoted] = useState<'up' | 'down' | null>(null)
  const [voting, setVoting] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  async function vote(e: React.MouseEvent, dir: 'up' | 'down') {
    e.stopPropagation()
    if (voting) return
    setVoting(true)
    try {
      const result = await api.public.vote(skill.id, dir)
      setVotes(prev => {
        const next = { ...prev }
        if (result.action === 'added') next[dir === 'up' ? 'up' : 'down']++
        if (result.action === 'removed') next[dir === 'up' ? 'up' : 'down']--
        if (result.action === 'flipped') { if (dir === 'up') { next.up++; next.down-- } else { next.up--; next.down++ } }
        return next
      })
      setVoted(result.action === 'removed' ? null : dir)
    } catch { /* ignore */ }
    setVoting(false)
  }

  function share(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(`${window.location.origin}/s/pub-${skill.id}`)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }

  return (
    <div onClick={onClick} className="group relative bg-[#080d1f]/80 border border-white/[0.07] rounded-2xl p-5 backdrop-blur-sm hover:border-indigo-500/40 hover:shadow-[0_0_25px_rgba(99,102,241,0.12)] hover:bg-[#0c1228]/80 transition-all duration-300 flex flex-col cursor-pointer h-full">
      {skill.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {skill.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">{tag}</span>
          ))}
        </div>
      )}
      <h3 className="text-white font-semibold text-base leading-snug mb-2 group-hover:text-indigo-300 transition-colors">{skill.name}</h3>
      <p className="text-white/50 text-sm leading-relaxed flex-1 mb-4 line-clamp-3">{skill.description}</p>
      <div className="flex items-center gap-1.5 pt-3 border-t border-white/6">
        <button onClick={e => vote(e, 'up')} className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${voted === 'up' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'text-white/40 hover:text-emerald-400 hover:bg-emerald-500/10 border border-transparent'}`}>▲ {votes.up}</button>
        <button onClick={e => vote(e, 'down')} className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${voted === 'down' ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'text-white/40 hover:text-red-400 hover:bg-red-500/10 border border-transparent'}`}>▼ {votes.down}</button>
        <div className="flex-1" />
        <button onClick={share} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-white/30 hover:text-indigo-400 hover:bg-indigo-500/10 border border-transparent transition-all" title="Copy share link">
          {shareCopied ? <span className="text-emerald-400">✓</span> : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Tools / Steps data ───────────────────────────────────────────────────────
const TOOLS = [
  { id: 'claude', label: 'Claude', icon: '🤖', config: `// claude_desktop_config.json\n{\n  "mcpServers": {\n    "raxteam": {\n      "command": "npx",\n      "args": ["-y", "@raxteam/mcp"],\n      "env": { "RAXTEAM_API_KEY": "sk-your-key" }\n    }\n  }\n}` },
  { id: 'cursor', label: 'Cursor', icon: '⚡', config: `// .cursor/mcp.json\n{\n  "mcpServers": {\n    "raxteam": {\n      "command": "npx",\n      "args": ["-y", "@raxteam/mcp"],\n      "env": { "RAXTEAM_API_KEY": "sk-your-key" }\n    }\n  }\n}` },
  { id: 'windsurf', label: 'Windsurf', icon: '🌊', config: `// mcp_config.json\n{\n  "mcpServers": {\n    "raxteam": {\n      "command": "npx",\n      "args": ["-y", "@raxteam/mcp"],\n      "env": { "RAXTEAM_API_KEY": "sk-your-key" }\n    }\n  }\n}` },
  { id: 'api', label: 'REST API', icon: '💬', config: `curl https://api.raxteam.com/resolve \\\n  -H "Authorization: Bearer sk-your-key" \\\n  -H "Content-Type: application/json" \\\n  -d '{"query": "summarize a support ticket"}'` },
]

const STEPS = [
  { num: '01', title: 'Sign up & get your API key', detail: 'No credit card required. Free tier includes 25 skills and 500 resolver calls per month.' },
  { num: '02', title: 'Add RaxTeam to your AI tool', detail: 'Takes 60 seconds. Restart your IDE and the RaxTeam tools appear automatically.' },
  { num: '03', title: 'AI resolves skills automatically', detail: 'Before any complex task, your AI calls resolve_skill and gets the best matching template.' },
  { num: '04', title: 'Submit & vote on new skills', detail: 'Extract clever prompts as skills. The community votes them up. Quality over quantity.' },
]

function useTypewriter(text: string, speed = 12, active = true) {
  const [displayed, setDisplayed] = useState('')
  const idx = useRef(0)
  useEffect(() => {
    if (!active) { setDisplayed(''); idx.current = 0; return }
    idx.current = 0; setDisplayed('')
    const interval = setInterval(() => {
      if (idx.current < text.length) { setDisplayed(text.slice(0, idx.current + 1)); idx.current++ }
      else clearInterval(interval)
    }, speed)
    return () => clearInterval(interval)
  }, [text, active, speed])
  return displayed
}

// ─── GetStarted section ───────────────────────────────────────────────────────
function GetStartedSection({ onSignUp }: { onSignUp: () => void }) {
  const [activeTool, setActiveTool] = useState(0)
  const [activeStep, setActiveStep] = useState(0)
  const [copied, setCopied] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const displayed = useTypewriter(TOOLS[activeTool].config, 12, visible)

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true) }, { threshold: 0.15 })
    if (sectionRef.current) obs.observe(sectionRef.current)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    const t = setInterval(() => setActiveStep(s => (s + 1) % STEPS.length), 3000)
    return () => clearInterval(t)
  }, [visible])

  function copy() {
    navigator.clipboard.writeText(TOOLS[activeTool].config)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      ref={sectionRef}
      style={{ scrollSnapAlign: 'start', minHeight: '100dvh' }}
      className="relative z-10 flex flex-col justify-center px-6 py-16 overflow-hidden"
    >
      {/* Section glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[600px] h-[400px] bg-indigo-600/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-violet-600/8 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-6xl mx-auto w-full">
        <div className={`text-center mb-10 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <div style={{animation: 'floatBadge 3s ease-in-out infinite'}} className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 text-indigo-400 text-xs font-medium mb-5">
            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
            Get started in 60 seconds
          </div>
          <h2 style={shimmerStyle} className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight mb-4">
            Works with every AI tool<br />you already use
          </h2>
          <p className="text-white/40 max-w-lg mx-auto text-sm sm:text-base">
            RaxTeam plugs into Claude, Cursor, Windsurf, or any REST API. Your shared skills are available everywhere.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Steps */}
          <div className={`transition-all duration-700 delay-100 ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-6'}`}>
            <div className="space-y-2">
              {STEPS.map((step, i) => (
                <button key={step.num} onClick={() => setActiveStep(i)}
                  className={`w-full text-left rounded-2xl p-4 border transition-all duration-300 ${activeStep === i ? 'bg-indigo-500/10 border-indigo-500/40 shadow-lg shadow-indigo-500/5' : 'bg-white/[0.02] border-white/6 hover:border-white/15'}`}>
                  <div className="flex items-start gap-4">
                    <div className={`text-xs font-bold tabular-nums mt-0.5 transition-colors duration-300 ${activeStep === i ? 'text-indigo-400' : 'text-white/20'}`}>{step.num}</div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-sm mb-1 transition-colors duration-300 ${activeStep === i ? 'text-white' : 'text-white/50'}`}>{step.title}</div>
                      <div className={`text-xs leading-relaxed transition-opacity duration-300 ${activeStep === i ? 'text-white/60 opacity-100' : 'text-white/30 opacity-60'}`}>{step.detail}</div>
                    </div>
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 transition-all duration-300 ${activeStep === i ? 'bg-indigo-400 shadow-sm shadow-indigo-400' : 'bg-white/10'}`} />
                  </div>
                </button>
              ))}
            </div>
            <button onClick={onSignUp} className="mt-5 w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2">
              Get your free API key →
            </button>
          </div>

          {/* Code block */}
          <div className={`transition-all duration-700 delay-200 ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-6'}`}>
            <div className="bg-[#0a0c12] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              <div className="flex border-b border-white/8 overflow-x-auto">
                {TOOLS.map((t, i) => (
                  <button key={t.id} onClick={() => { setActiveTool(i); setCopied(false) }}
                    className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-all ${activeTool === i ? 'border-indigo-500 text-white bg-white/4' : 'border-transparent text-white/40 hover:text-white/70'}`}>
                    <span>{t.icon}</span>{t.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                </div>
                <button onClick={copy} className="text-xs text-white/30 hover:text-white/70 transition-colors">{copied ? '✓ Copied' : '⧉ Copy'}</button>
              </div>
              <div className="p-5 font-mono text-xs leading-relaxed text-emerald-300/80 min-h-[160px] overflow-x-auto">
                <pre className="whitespace-pre-wrap break-words">{displayed}<span className="inline-block w-0.5 h-3.5 bg-indigo-400 ml-0.5 align-middle animate-pulse" /></pre>
              </div>
              <div className="px-5 pb-5">
                <div className="bg-indigo-500/8 border border-indigo-500/20 rounded-xl px-4 py-3 text-xs text-indigo-300/70 leading-relaxed">
                  💡 Replace <span className="text-indigo-300 font-medium">sk-your-key</span> with your key from{' '}
                  <button onClick={onSignUp} className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">the dashboard</button>
                  {' '}· Restart IDE · Done.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Anonymous submit section ─────────────────────────────────────────────────
export type AnonSubmitHandle = { openForm: () => void }

const AnonSubmitSection = forwardRef<AnonSubmitHandle>(function AnonSubmitSection(_, ref) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', promptTemplate: '', tags: '' })
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const sectionRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useImperativeHandle(ref, () => ({ openForm: () => { setOpen(true); setResult(null) } }))

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true) }, { threshold: 0.15 })
    if (sectionRef.current) obs.observe(sectionRef.current)
    return () => obs.disconnect()
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true); setResult(null)
    try {
      const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean)
      const r = await api.public.submit({ name: form.name, description: form.description, promptTemplate: form.promptTemplate, tags })
      setResult({ ok: true, msg: r.message })
      setForm({ name: '', description: '', promptTemplate: '', tags: '' })
    } catch (e: unknown) {
      setResult({ ok: false, msg: (e as Error).message })
    } finally { setSubmitting(false) }
  }

  return (
    <div
      ref={sectionRef}
      style={{ scrollSnapAlign: 'start', minHeight: '100dvh' }}
      className="relative z-10 flex flex-col items-center justify-center px-6 py-16 overflow-hidden"
    >
      {/* Section glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-violet-600/8 rounded-full blur-[120px]" />
        <div className="absolute top-1/4 right-1/4 w-[300px] h-[300px] bg-cyan-500/6 rounded-full blur-[100px]" />
      </div>

      <div className={`max-w-2xl mx-auto text-center w-full transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
        {/* Badge */}
        <div style={{animation: visible ? 'floatBadge 3s ease-in-out infinite' : 'none'}} className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/30 rounded-full px-4 py-1.5 text-violet-300 text-xs font-medium mb-6 shadow-[0_0_20px_rgba(139,92,246,0.15)]">
          <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
          No account needed
        </div>

        {/* Heading */}
        <h2 style={shimmerStyle} className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight mb-4">
          Have a prompt<br />worth sharing?
        </h2>
        <p className="text-white/40 mb-8 max-w-md mx-auto">
          Submit a skill anonymously. The community reviews and votes on the best ones.
        </p>

        {/* 3 feature pills */}
        {!open && !result && (
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {[
              { icon: '✦', label: 'Anonymous' },
              { icon: '⚡', label: 'Instant submit' },
              { icon: '🌐', label: 'Community review' },
            ].map(f => (
              <div key={f.label} className="flex items-center gap-1.5 bg-white/[0.04] border border-white/10 rounded-full px-3.5 py-1.5 text-xs text-white/50">
                <span className="text-violet-400">{f.icon}</span>{f.label}
              </div>
            ))}
          </div>
        )}

        {!open && !result && (
          <button onClick={() => setOpen(true)}
            className="px-8 py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-xl text-sm font-semibold text-white shadow-[0_0_30px_rgba(139,92,246,0.35)] hover:shadow-[0_0_40px_rgba(139,92,246,0.5)] transition-all border border-violet-400/20">
            + Submit a skill
          </button>
        )}

        {result && (
          <div className={`text-sm px-5 py-4 rounded-2xl ${result.ok ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            {result.msg}
            {result.ok && <button onClick={() => { setResult(null); setOpen(false) }} className="ml-3 underline text-xs opacity-70 hover:opacity-100">Submit another</button>}
            {!result.ok && <button onClick={() => setResult(null)} className="ml-3 underline text-xs opacity-70 hover:opacity-100">Try again</button>}
          </div>
        )}

        {open && !result && (
          <form onSubmit={submit} className="text-left bg-white/[0.03] border border-white/10 rounded-2xl p-6 space-y-4 shadow-[0_0_40px_rgba(139,92,246,0.08)]">
            <div>
              <label className="block text-xs font-semibold text-white/50 mb-1.5">Skill name *</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50"
                placeholder="e.g. Summarize support ticket" maxLength={120} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/50 mb-1.5">Description *</label>
              <textarea required rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50 resize-none"
                placeholder="What does this skill do?" maxLength={500} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/50 mb-1.5">Prompt template *</label>
              <textarea required rows={5} value={form.promptTemplate} onChange={e => setForm(f => ({ ...f, promptTemplate: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono placeholder-white/20 focus:outline-none focus:border-indigo-500/50 resize-y"
                placeholder="You are a helpful assistant. {{context}}" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/50 mb-1.5">Tags <span className="font-normal opacity-60">(comma separated)</span></label>
              <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50"
                placeholder="support, summarization" />
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-3">
                <button type="submit" disabled={submitting}
                  className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-all">
                  {submitting ? 'Submitting…' : 'Submit for review'}
                </button>
                <button type="button" onClick={() => setOpen(false)} className="text-sm text-white/40 hover:text-white/70 transition-colors">Cancel</button>
              </div>
              <span className="text-white/20 text-xs hidden sm:block">Reviewed by community</span>
            </div>
          </form>
        )}
      </div>
    </div>
  )
})

// ─── Reusable inline lead-capture strip ──────────────────────────────────────
function LeadCaptureRow({ placeholder = 'your@email.com', cta = 'Get started free →', source = 'hero' }: { placeholder?: string; cta?: string; source?: string }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setState('loading')
    try {
      await api.public.contact({ name: 'Lead', email, message: `[LEAD] ${source} — ${email} wants access.` })
      setState('done')
    } catch { setState('error') }
  }

  if (state === 'done') return (
    <div className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-sm">
      <span className="text-lg">✓</span> Got it! We'll be in touch at <strong>{email}</strong>
    </div>
  )

  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2 w-full max-w-md mx-auto">
      <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={placeholder}
        className="flex-1 bg-white/[0.07] border border-white/15 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/40 transition-all backdrop-blur-sm" />
      <button type="submit" disabled={state === 'loading'}
        className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl text-sm font-semibold text-white whitespace-nowrap transition-all disabled:opacity-60 shadow-[0_0_20px_rgba(99,102,241,0.35)]">
        {state === 'loading' ? '…' : cta}
      </button>
      {state === 'error' && <p className="text-xs text-red-400 sm:col-span-2">Something went wrong — try emailing us directly.</p>}
    </form>
  )
}

// ─── Landing contact form ─────────────────────────────────────────────────────
function LandingContactForm() {
  const [form, setForm] = useState({ name: '', email: '', useCase: '', teamSize: '', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true); setResult(null)
    const fullMessage = [
      form.useCase && `Use case: ${form.useCase}`,
      form.teamSize && `Team size: ${form.teamSize}`,
      form.message,
    ].filter(Boolean).join('\n')
    try {
      const r = await api.public.contact({ name: form.name, email: form.email, message: fullMessage })
      setResult({ ok: true, msg: r.message })
      setForm({ name: '', email: '', useCase: '', teamSize: '', message: '' })
    } catch (err: unknown) {
      setResult({ ok: false, msg: (err as Error).message })
    } finally { setSubmitting(false) }
  }

  const selectCls = "w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/40 transition-all appearance-none"
  const inputCls = "w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/40 transition-all"

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm">
      {/* Header strip */}
      <div className="bg-gradient-to-r from-indigo-600/80 to-violet-600/80 px-6 py-5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="text-white font-semibold text-sm">Talk to us — we reply fast</p>
          <p className="text-white/60 text-xs">hello@raxteam.com · usually within a few hours</p>
        </div>
      </div>

      <form onSubmit={submit} className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-white/40 mb-1.5">Your name *</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} maxLength={120}
              className={inputCls} placeholder="Alice Chen" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/40 mb-1.5">Work email *</label>
            <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} maxLength={200}
              className={inputCls} placeholder="alice@company.com" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-white/40 mb-1.5">What are you building?</label>
            <select value={form.useCase} onChange={e => setForm(f => ({ ...f, useCase: e.target.value }))} className={selectCls}>
              <option value="">Select use case…</option>
              <option value="Internal AI tooling for my team">Internal AI tooling</option>
              <option value="AI-powered product for customers">AI product for customers</option>
              <option value="Research / experimentation">Research / experimentation</option>
              <option value="Prompt library / knowledge base">Prompt library</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/40 mb-1.5">Team size</label>
            <select value={form.teamSize} onChange={e => setForm(f => ({ ...f, teamSize: e.target.value }))} className={selectCls}>
              <option value="">Select size…</option>
              <option value="Just me">Just me</option>
              <option value="2–10 people">2–10 people</option>
              <option value="11–50 people">11–50 people</option>
              <option value="50+ people">50+ people</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-white/40 mb-1.5">Message *</label>
          <textarea required rows={4} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} maxLength={2000}
            className={`${inputCls} resize-none`}
            placeholder="Tell us what you're working on, what's not working today, or just say hi. We read everything." />
          <p className="text-right text-xs text-white/25 mt-1">{form.message.length}/2000</p>
        </div>

        {result && (
          <div className={`text-sm px-4 py-3 rounded-xl ${result.ok ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            {result.msg}
          </div>
        )}

        <button type="submit" disabled={submitting}
          className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
          {submitting ? 'Sending…' : 'Send message →'}
        </button>

        <p className="text-center text-xs text-white/20">No spam. Your email stays private.</p>
      </form>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const skillsSectionRef = useRef<HTMLDivElement>(null)
  const anonSubmitRef = useRef<AnonSubmitHandle>(null)
  const anonSectionRef = useRef<HTMLDivElement>(null)

  function scrollToSkills() {
    const container = scrollContainerRef.current
    const section = skillsSectionRef.current
    if (!container || !section) return
    container.scrollTo({ top: section.offsetTop, behavior: 'smooth' })
  }

  function openSubmitForm() {
    anonSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
    // slight delay so scroll completes before form opens
    setTimeout(() => anonSubmitRef.current?.openForm(), 400)
  }

  const [initialSkills, setInitialSkills] = useState<Skill[]>([])
  const [extraSkills, setExtraSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)

  useEffect(() => {}, [searchParams])

  const loadSkills = useCallback(async (p: number, q: string, lim: number) => {
    setLoading(true)
    try {
      const res = await api.public.skills({ page: p, search: q || undefined, limit: lim })
      if (p === 1) { setInitialSkills(res.skills); setExtraSkills([]) }
      else setExtraSkills(prev => [...prev, ...res.skills])
      setHasMore(res.skills.length >= lim)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { loadSkills(1, '', 5) }, [loadSkills])

  function handleSearch(q: string) { setSearch(q); setPage(1); loadSkills(1, q, 5) }
  function loadMore() { const next = page + 1; setPage(next); loadSkills(next, search, 10) }

  return (
    <div
      ref={scrollContainerRef}
      className="bg-[#04081a] text-white"
      style={{ height: '100dvh', overflowY: 'scroll', scrollSnapType: 'y mandatory', scrollPaddingTop: '57px' }}
    >
      <style>{`
        @keyframes aurora1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(60px,-40px) scale(1.1)} 66%{transform:translate(-30px,60px) scale(0.9)} }
        @keyframes aurora2 { 0%,100%{transform:translate(0,0) scale(1.1)} 33%{transform:translate(-80px,50px) scale(0.9)} 66%{transform:translate(50px,-60px) scale(1.2)} }
        @keyframes aurora3 { 0%,100%{transform:translate(0,0) scale(0.9)} 50%{transform:translate(40px,40px) scale(1.15)} }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes floatBadge { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Aurora — fixed to viewport */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div style={{animation: 'aurora1 25s ease-in-out infinite'}} className="absolute top-[-10%] left-[-10%] w-[700px] h-[700px] bg-indigo-600/20 rounded-full blur-[120px]" />
        <div style={{animation: 'aurora2 30s ease-in-out infinite'}} className="absolute top-[20%] right-[-15%] w-[600px] h-[600px] bg-violet-600/15 rounded-full blur-[120px]" />
        <div style={{animation: 'aurora3 20s ease-in-out infinite'}} className="absolute bottom-[10%] left-[20%] w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[100px]" />
        <div style={{animation: 'aurora1 35s ease-in-out infinite reverse'}} className="absolute top-[50%] right-[30%] w-[400px] h-[400px] bg-purple-500/12 rounded-full blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.12]" style={{backgroundImage:'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' viewBox=\'0 0 40 40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Ccircle cx=\'1\' cy=\'1\' r=\'1\' fill=\'%236366f1\' fill-opacity=\'0.4\'/%3E%3C/svg%3E")',backgroundSize:'40px 40px'}} />
      </div>

      {/* ── Navbar (sticky inside scroll container) ── */}
      <nav className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 backdrop-blur-md bg-transparent">
        <div className="flex items-center gap-2">
          <RaxTeamLogo size={28} />
          <span className="font-semibold text-white">RaxTeam</span>
        </div>
        <div className="flex items-center gap-3">
          {isLoggedIn() ? (
            <button onClick={() => navigate('/skills')} className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium transition-colors">Dashboard →</button>
          ) : (
            <>
              <button onClick={() => navigate('/login')} className="text-sm text-white/60 hover:text-white transition-colors hidden sm:block">Sign in</button>
              <button onClick={() => navigate('/login')} className="px-4 py-1.5 text-sm bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-lg font-medium transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)]">Get started</button>
            </>
          )}
        </div>
      </nav>

      {/* ── Section 1: Hero ── */}
      <div style={{ scrollSnapAlign: 'start', minHeight: 'calc(100dvh - 57px)' }} className="relative z-10 flex flex-col items-center justify-center px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div style={{animation: 'floatBadge 3s ease-in-out infinite'}} className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 rounded-full px-4 py-1.5 text-indigo-300 text-xs font-medium mb-8 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            MCP-native · Free to start · 5 min setup
          </div>
          <h1 style={shimmerStyle} className="text-5xl sm:text-7xl font-bold tracking-tight leading-tight mb-5">
            Shared AI skills,<br />ready to deploy
          </h1>
          <p className="text-slate-400 text-lg max-w-xl mx-auto mb-8">
            Stop rebuilding the same prompts. RaxTeam lets your team share, version, and deploy AI skills across every project — with a single MCP endpoint.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
            <button onClick={() => navigate('/login')}
              className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold transition-all shadow-[0_0_30px_rgba(99,102,241,0.4)] hover:shadow-[0_0_50px_rgba(99,102,241,0.6)] border border-indigo-400/30 text-base">
              Get started free →
            </button>
            <button onClick={scrollToSkills}
              className="px-8 py-4 border border-white/10 hover:border-indigo-500/40 hover:bg-indigo-500/5 rounded-xl text-white/60 hover:text-white transition-all backdrop-blur-sm text-base">
              Browse skills ↓
            </button>
          </div>

          {/* Inline lead capture */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-white/30 text-xs">Not ready to sign up? Drop your email and we'll reach out.</p>
            <LeadCaptureRow placeholder="your@email.com" cta="Notify me →" source="hero" />
          </div>

          {/* Scroll indicator */}
          <div className="mt-12 flex flex-col items-center gap-1 text-white/20 text-xs">
            <span>scroll to explore</span>
            <div className="w-px h-8 bg-gradient-to-b from-white/20 to-transparent" />
          </div>
        </div>
      </div>

      {/* ── Section 2: Anonymous submit ── */}
      <div ref={anonSectionRef}>
        <AnonSubmitSection ref={anonSubmitRef} />
      </div>

      {/* ── Section 3: Get Started / integrations ── */}
      <GetStartedSection onSignUp={() => navigate('/login')} />

      {/* ── Section 4: Community Skills ── */}
      <div id="skills" ref={skillsSectionRef} style={{ scrollSnapAlign: 'start', minHeight: '100dvh' }} className="relative z-10 flex flex-col py-16 overflow-hidden">
        {/* Section glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-indigo-600/6 rounded-full blur-[120px]" />
        </div>

        <div className="max-w-6xl mx-auto w-full px-6 relative">
          {/* Section header */}
          <div className="text-center mb-10">
            <div style={{animation: 'floatBadge 3.5s ease-in-out infinite'}} className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 text-indigo-400 text-xs font-medium mb-5">
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
              Community curated
            </div>
            <h2 style={shimmerStyle} className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight mb-3">
              Community Skills
            </h2>
            <p className="text-white/40 max-w-md mx-auto">Approved prompt templates, ready to use in any AI workflow.</p>
          </div>

          {/* Search + count bar */}
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">⌕</span>
              <input type="text" placeholder="Search skills..." value={search} onChange={e => handleSearch(e.target.value)}
                className="w-48 sm:w-72 bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 transition-colors" />
            </div>
            <span className="text-white/20 text-xs">{initialSkills.length + extraSkills.length} skills</span>
          </div>

          {loading && initialSkills.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="bg-[#080d1f]/80 border border-white/[0.07] rounded-2xl p-5 animate-pulse h-48" />)}
            </div>
          ) : initialSkills.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <div className="text-3xl mb-3">✦</div>
              <div className="text-base">No public skills yet — be the first</div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {initialSkills.map(skill => <SkillCard key={skill.id} skill={skill} onClick={() => setSelectedSkill(skill)} />)}
              </div>
              {extraSkills.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mt-4">
                  {extraSkills.map(skill => <SkillCard key={skill.id} skill={skill} onClick={() => setSelectedSkill(skill)} />)}
                </div>
              )}
              {hasMore && (
                <div className="text-center mt-8">
                  <button onClick={loadMore} disabled={loading}
                    className="px-6 py-2.5 border border-white/10 hover:border-indigo-500/40 hover:bg-indigo-500/5 rounded-xl text-white/60 hover:text-white text-sm transition-all disabled:opacity-50 backdrop-blur-sm">
                    {loading ? 'Loading...' : 'Load more skills'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Section 5: Why RaxTeam (stats) ── */}
      <div style={{ scrollSnapAlign: 'start', minHeight: '100dvh' }} className="relative z-10 flex flex-col items-center justify-center px-6 py-16 overflow-hidden">
        {/* Section glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-indigo-600/8 rounded-full blur-[120px]" />
        </div>

        <div className="max-w-4xl mx-auto w-full relative text-center">
          <div style={{animation: 'floatBadge 4s ease-in-out infinite'}} className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 text-emerald-400 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            Built for AI-first teams
          </div>
          <h2 style={shimmerStyle} className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight mb-4">
            Why RaxTeam?
          </h2>
          <p className="text-white/40 mb-12 max-w-md mx-auto">Stop copy-pasting prompts. Share, version, and resolve the best ones automatically.</p>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-14">
            {[
              { value: 'MCP', label: 'Native protocol', desc: 'No plugins, no wrappers', icon: '⚡', color: 'indigo' },
              { value: '100%', label: 'Community-curated', desc: 'Every skill peer reviewed', icon: '✦', color: 'violet' },
              { value: 'Free', label: 'Generous free tier', desc: '25 skills, forever free', icon: '🎁', color: 'emerald' },
              { value: 'OSS', label: 'Open source', desc: 'MCP package on npm', icon: '🔓', color: 'cyan' },
            ].map(s => (
              <div key={s.label} className={`relative bg-white/[0.03] border border-white/8 rounded-2xl p-6 hover:border-white/15 transition-all hover:bg-white/[0.05] group`}>
                <div className="text-2xl mb-3">{s.icon}</div>
                <div className="text-3xl font-bold text-white mb-1">{s.value}</div>
                <div className="text-xs font-semibold text-white/60 mb-1">{s.label}</div>
                <div className="text-xs text-white/30 leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="flex flex-col items-center gap-6">
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/login')}
                className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-base transition-all shadow-[0_0_30px_rgba(99,102,241,0.4)] border border-indigo-400/30">
                Get started free →
              </button>
              <button onClick={scrollToSkills}
                className="px-8 py-4 border border-white/10 hover:border-white/20 rounded-xl text-white/50 hover:text-white text-base transition-all">
                Browse skills
              </button>
            </div>
            <div className="flex flex-col items-center gap-2 w-full">
              <p className="text-white/25 text-xs">Or tell us what you're building — we'll help you get set up.</p>
              <LeadCaptureRow placeholder="your@work.com" cta="Let's talk →" source="why-raxteam" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 6: Contact Us ── */}
      <div style={{ scrollSnapAlign: 'start', minHeight: '100dvh' }} className="relative z-10 flex flex-col items-center justify-center px-6 py-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-violet-600/8 rounded-full blur-[120px]" />
        </div>
        <div className="max-w-2xl mx-auto w-full relative">
          <div className="text-center mb-10">
            <div style={{animation: 'floatBadge 4s ease-in-out infinite'}} className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 text-indigo-400 text-xs font-medium mb-6">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              We reply fast — usually within a few hours
            </div>
            <h2 style={shimmerStyle} className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight mb-4">
              Let's talk
            </h2>
            <p className="text-white/40 max-w-sm mx-auto">Tell us what you're building. We'll help you figure out if RaxTeam is the right fit — and how to get started.</p>
          </div>
          <LandingContactForm />
        </div>
      </div>

      {/* ── Footer (no snap — tail end) ── */}
      <footer className="relative z-10 py-10 px-6 text-center text-white/30 text-sm border-t border-white/6">
        <div className="flex items-center justify-center gap-2 mb-3">
          <RaxTeamLogo size={22} />
          <span className="text-white/60 font-semibold">RaxTeam</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-white/20 text-xs">
          <a href="/login" className="hover:text-white/60 transition-colors">Sign in</a>
          <span>·</span>
          <a href="/api-docs" className="hover:text-white/60 transition-colors">API Docs</a>
          <span>·</span>
          <a href="/badge" className="hover:text-white/60 transition-colors">Badge</a>
          <span>·</span>
          <a href="mailto:hello@raxteam.com" className="hover:text-white/60 transition-colors">hello@raxteam.com</a>
          <span>·</span>
          <span>© {new Date().getFullYear()} raxteam.com</span>
        </div>
      </footer>

      {selectedSkill && <SkillDetailModal skill={selectedSkill} onClose={() => setSelectedSkill(null)} />}
    </div>
  )
}

