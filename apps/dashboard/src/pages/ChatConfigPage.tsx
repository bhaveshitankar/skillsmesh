import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'

const PROVIDERS = [
  { id: 'cloudflare', label: 'Cloudflare AI', badge: 'Free', badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200', desc: 'Llama 3.3 70B — no API key needed, included in your plan' },
  { id: 'openai', label: 'OpenAI', badge: '', badgeColor: '', desc: 'GPT-4o, GPT-4o-mini — bring your own API key' },
  { id: 'anthropic', label: 'Anthropic', badge: '', badgeColor: '', desc: 'Claude Haiku / Sonnet — bring your own API key' },
  { id: 'gemini', label: 'Google Gemini', badge: 'Free tier', badgeColor: 'bg-blue-100 text-blue-700 border-blue-200', desc: 'Gemini 2.0 Flash — generous free quota with your API key' },
  { id: 'groq', label: 'Groq', badge: 'Fast', badgeColor: 'bg-amber-100 text-amber-700 border-amber-200', desc: 'Llama 3.3 70B at ~500 tok/s — bring your own API key' },
]

const DEFAULT_MODELS: Record<string, string[]> = {
  cloudflare: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct', '@cf/mistral/mistral-7b-instruct-v0.2'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
  anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-8'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
}

type Config = {
  provider: string; model: string; hasApiKey: boolean; systemPrompt: string
  widgetEnabled: boolean; widgetToken: string | null; widgetAllowedOrigins: string
  workflowId: string | null; workflowName: string | null
}

const card = 'bg-white rounded-2xl border border-gray-200 overflow-hidden'
const cardHeader = 'px-6 py-4 border-b border-gray-100'
const cardBody = 'px-6 py-5'
const inputCls = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all'
const labelCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block'

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-1 ${on ? 'bg-brand-600' : 'bg-gray-200'}`}
      style={{ width: '2.5rem', height: '1.375rem' }}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-[1.125rem]' : 'translate-x-0'}`} />
    </button>
  )
}

export default function ChatConfigPage() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [error, setError] = useState('')
  const [isPro, setIsPro] = useState(true)
  const [orgSlug, setOrgSlug] = useState('')

  const [provider, setProvider] = useState('cloudflare')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [widgetEnabled, setWidgetEnabled] = useState(false)
  const [widgetAllowedOrigins, setWidgetAllowedOrigins] = useState('')

  const [workflowId, setWorkflowId] = useState<string | null>(null)
  const [workflowName, setWorkflowName] = useState<string | null>(null)
  const [availableWorkflows, setAvailableWorkflows] = useState<Array<{ id: string; name: string; type: string }>>([])

  const [chatTitle, setChatTitle] = useState('AI Assistant')
  const [botName, setBotName] = useState('Assistant')
  const [welcomeMessage, setWelcomeMessage] = useState('Hi! How can I help you?')
  const [inputPlaceholder, setInputPlaceholder] = useState('Type a message…')
  const [accentColor, setAccentColor] = useState('#4f46e5')
  const [showPoweredBy, setShowPoweredBy] = useState(true)

  useEffect(() => {
    api.me().then(r => { setIsPro(r.org.plan !== 'free'); setOrgSlug(r.org.slug) }).catch(() => {})
    api.workflows.list().then(r => setAvailableWorkflows(
      r.workflows.filter(w => w.status === 'published').map(w => ({ id: w.id, name: w.name, type: w.type }))
    )).catch(() => {})
    api.chat.config().then(c => {
      setCfg(c)
      setProvider(c.provider ?? 'cloudflare')
      setModel(c.model ?? '')
      setSystemPrompt(c.systemPrompt ?? '')
      setWidgetEnabled(c.widgetEnabled ?? false)
      setWidgetAllowedOrigins(c.widgetAllowedOrigins ?? '')
      setWorkflowId(c.workflowId ?? null)
      setWorkflowName(c.workflowName ?? null)
      setChatTitle(c.chatTitle || 'AI Assistant')
      setBotName(c.botName || 'Assistant')
      setWelcomeMessage(c.welcomeMessage || 'Hi! How can I help you?')
      setInputPlaceholder(c.inputPlaceholder || 'Type a message…')
      setAccentColor(c.accentColor || '#4f46e5')
      setShowPoweredBy(c.showPoweredBy ?? true)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast(msg); setToastType(type); setTimeout(() => setToast(''), 3000)
  }

  async function save() {
    setSaving(true); setError('')
    try {
      const res = await api.chat.updateConfig({
        provider, model, systemPrompt, widgetEnabled, widgetAllowedOrigins,
        workflowId: workflowId ?? null, workflowName: workflowName ?? null,
        chatTitle, botName, welcomeMessage, inputPlaceholder, accentColor, showPoweredBy,
        ...(apiKey ? { apiKey } : {}),
      })
      setCfg(prev => prev ? {
        ...prev, provider, model, systemPrompt, widgetEnabled, widgetAllowedOrigins,
        workflowId, workflowName,
        chatTitle, botName, welcomeMessage, inputPlaceholder, accentColor, showPoweredBy,
        hasApiKey: !!apiKey || prev.hasApiKey,
        widgetToken: res.widgetToken ?? prev.widgetToken,
      } : prev)
      setApiKey('')
      showToast('Settings saved')
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally { setSaving(false) }
  }

  async function regenerateToken() {
    setSaving(true)
    try {
      const res = await api.chat.updateConfig({ regenerateToken: true })
      setCfg(prev => prev ? { ...prev, widgetToken: res.widgetToken } : prev)
      showToast('Widget token regenerated')
    } catch (e: unknown) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  async function testConnection() {
    setTesting(true); setError('')
    try {
      const res = await api.chat.send({ message: 'Hello, respond with just "Connection successful!"', history: [] })
      if (res.reply) showToast(`Connected via ${res.provider}`)
      else setError('No response from LLM')
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally { setTesting(false) }
  }

  const widgetUrl = cfg?.widgetToken && orgSlug ? `${window.location.origin}/chat/${orgSlug}#token=${cfg.widgetToken}` : ''
  const embedCode = widgetUrl ? `<iframe\n  src="${widgetUrl}"\n  width="400"\n  height="600"\n  style="border:none;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.12)"\n  allow="clipboard-write">\n</iframe>` : ''
  const apiExample = `POST https://api.raxteam.com/public/chat/${orgSlug}\nContent-Type: application/json\n\n{\n  "token": "${cfg?.widgetToken ?? 'your-widget-token'}",\n  "message": "What skills does this org have?",\n  "history": []\n}`

  if (!isPro) return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center gap-5">
      <div className="w-16 h-16 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-center">
        <svg className="w-8 h-8 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <div>
        <h2 className="text-gray-900 font-bold text-xl mb-2">Org Chatbot is a Pro feature</h2>
        <p className="text-gray-500 text-sm max-w-sm leading-relaxed">Upgrade to configure and embed your org's AI assistant on any website.</p>
      </div>
      <Link to="/upgrade" className="px-6 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm">Upgrade to Pro →</Link>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="flex items-center gap-2 text-gray-400 text-sm">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        Loading…
      </div>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-8 py-8 space-y-5">

      {/* Page header */}
      <div className="mb-2">
        <h1 className="text-gray-900 font-bold text-xl">Chat Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Configure the AI provider, context mode, and widget for your org chatbot.</p>
      </div>

      {/* ── LLM Provider ─────────────────────────────────────────────────────── */}
      <div className={card}>
        <div className={cardHeader}>
          <h2 className="text-sm font-semibold text-gray-800">LLM Provider</h2>
          <p className="text-xs text-gray-400 mt-0.5">Choose which AI model powers your chatbot</p>
        </div>
        <div className={cardBody + ' space-y-2'}>
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              onClick={() => { setProvider(p.id); setModel(DEFAULT_MODELS[p.id]?.[0] ?? '') }}
              className={`w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                provider === p.id
                  ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-300'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 transition-all ${
                provider === p.id ? 'border-brand-500 bg-brand-500' : 'border-gray-300'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-gray-900 text-sm font-medium">{p.label}</span>
                  {p.badge && <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${p.badgeColor}`}>{p.badge}</span>}
                </div>
                <p className="text-gray-500 text-xs mt-0.5">{p.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Model + API Key ───────────────────────────────────────────────────── */}
      <div className={card}>
        <div className={cardHeader}>
          <h2 className="text-sm font-semibold text-gray-800">Model & API Key</h2>
          <p className="text-xs text-gray-400 mt-0.5">Select the model and provide an API key if required</p>
        </div>
        <div className={cardBody + ' space-y-4'}>
          <div>
            <label className={labelCls}>Model</label>
            <select value={model} onChange={e => setModel(e.target.value)} className={inputCls + ' appearance-none cursor-pointer'}>
              {(DEFAULT_MODELS[provider] ?? []).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {provider !== 'cloudflare' && (
            <div>
              <label className={labelCls}>
                API Key
                {cfg?.hasApiKey && <span className="ml-2 text-emerald-600 normal-case font-normal tracking-normal">✓ saved</span>}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                className={inputCls}
                placeholder={cfg?.hasApiKey ? 'Leave blank to keep existing key' : 'sk-…'}
              />
              <p className="text-gray-400 text-xs mt-1.5 flex items-center gap-1">
                <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Stored encrypted server-side. Never exposed to end users.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── System Prompt ─────────────────────────────────────────────────────── */}
      <div className={card}>
        <div className={cardHeader}>
          <h2 className="text-sm font-semibold text-gray-800">System Prompt</h2>
          <p className="text-xs text-gray-400 mt-0.5">Sets the assistant's persona and instructions. Org skills are appended automatically as context.</p>
        </div>
        <div className={cardBody}>
          <textarea
            rows={4}
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            className={inputCls + ' resize-none'}
            placeholder="You are a helpful assistant for our team. Use our org's skills to answer questions accurately and concisely."
          />
        </div>
      </div>

      {/* ── Workflow Mode ─────────────────────────────────────────────────────── */}
      <div className={card}>
        <div className={cardHeader}>
          <h2 className="text-sm font-semibold text-gray-800">Workflow Mode</h2>
          <p className="text-xs text-gray-400 mt-0.5">Route messages through a published workflow to build context instead of plain skill search</p>
        </div>
        <div className={cardBody + ' space-y-4'}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Use a workflow</p>
              <p className="text-xs text-gray-400 mt-0.5">The selected workflow runs on each message and its output becomes the LLM context</p>
            </div>
            <Toggle
              on={!!workflowId}
              onToggle={() => {
                if (workflowId) { setWorkflowId(null); setWorkflowName(null) }
                else if (availableWorkflows.length > 0) { setWorkflowId(availableWorkflows[0].id); setWorkflowName(availableWorkflows[0].name) }
              }}
            />
          </div>
          {workflowId && (
            <div>
              <label className={labelCls}>Workflow</label>
              {availableWorkflows.length === 0 ? (
                <p className="text-sm text-gray-400">No published workflows yet. <Link to="/workflows" className="text-brand-600 hover:underline">Create one →</Link></p>
              ) : (
                <select
                  value={workflowId}
                  onChange={e => {
                    const wf = availableWorkflows.find(w => w.id === e.target.value)
                    setWorkflowId(e.target.value)
                    setWorkflowName(wf?.name ?? null)
                  }}
                  className={inputCls + ' appearance-none cursor-pointer'}
                >
                  {availableWorkflows.map(w => <option key={w.id} value={w.id}>{w.name} ({w.type})</option>)}
                </select>
              )}
              <p className="text-xs text-gray-400 mt-1.5">
                The workflow receives the user's message as <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px] font-mono">{'{{input}}'}</code> and its output is fed as context to the LLM.
              </p>
            </div>
          )}
          {!workflowId && (
            <p className="text-xs text-gray-400">When off, the chat uses vector search over your org's approved skills for context.</p>
          )}
        </div>
      </div>

      {/* ── Personalization ───────────────────────────────────────────────────── */}
      <div className={card}>
        <div className={cardHeader}>
          <h2 className="text-sm font-semibold text-gray-800">Personalization</h2>
          <p className="text-xs text-gray-400 mt-0.5">Customize how the chat widget looks and feels to your users</p>
        </div>
        <div className={cardBody + ' grid grid-cols-1 md:grid-cols-2 gap-8'}>
          {/* Fields */}
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Chat title</label>
              <input value={chatTitle} onChange={e => setChatTitle(e.target.value)} maxLength={80}
                placeholder="AI Assistant" className={inputCls} />
              <p className="text-xs text-gray-400 mt-1">Shown in the widget header</p>
            </div>
            <div>
              <label className={labelCls}>Bot name</label>
              <input value={botName} onChange={e => setBotName(e.target.value)} maxLength={60}
                placeholder="Assistant" className={inputCls} />
              <p className="text-xs text-gray-400 mt-1">Shown as subtitle below the title</p>
            </div>
            <div>
              <label className={labelCls}>Welcome message</label>
              <textarea value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)}
                maxLength={300} rows={2} placeholder="Hi! How can I help you?" className={`${inputCls} resize-none`} />
              <p className="text-xs text-gray-400 mt-1">Shown when the chat is empty</p>
            </div>
            <div>
              <label className={labelCls}>Input placeholder</label>
              <input value={inputPlaceholder} onChange={e => setInputPlaceholder(e.target.value)}
                maxLength={100} placeholder="Type a message…" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Accent color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white shrink-0" />
                <input value={accentColor} onChange={e => setAccentColor(e.target.value)}
                  maxLength={7} placeholder="#4f46e5"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" />
              </div>
              <p className="text-xs text-gray-400 mt-1">Used for user bubbles and the send button</p>
            </div>
            <div className="flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-xl border border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-700">Show "Powered by RaxTeam"</p>
                <p className="text-xs text-gray-400 mt-0.5">Attribution footer in the widget</p>
              </div>
              <Toggle on={showPoweredBy} onToggle={() => setShowPoweredBy(p => !p)} />
            </div>
          </div>

          {/* Live preview */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Live preview</p>
            <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm flex flex-col" style={{ height: 420, background: '#0d0f16' }}>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8 shrink-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-sm"
                  style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}99)` }}>
                  {(chatTitle || 'A')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm leading-none truncate">{chatTitle || 'AI Assistant'}</p>
                  <p className="text-white/30 text-xs mt-0.5 truncate">{botName || 'Assistant'}</p>
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <div className="flex-1 overflow-hidden px-4 py-4 flex flex-col gap-3">
                <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${accentColor}20`, border: `1px solid ${accentColor}30` }}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: accentColor }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <p className="text-white/60 text-sm font-medium">{welcomeMessage || 'Hi! How can I help you?'}</p>
                </div>
                <div className="flex gap-2 flex-row-reverse">
                  <div className="max-w-[75%] px-3 py-2 rounded-2xl rounded-tr-sm text-sm text-white" style={{ background: accentColor }}>
                    What can you help with?
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-bold" style={{ background: accentColor }}>
                    {(botName || 'A')[0].toUpperCase()}
                  </div>
                  <div className="max-w-[75%] px-3 py-2 rounded-2xl rounded-tl-sm text-sm text-white/85 bg-white/8 border border-white/6">
                    I can answer questions using this org's skills and knowledge base!
                  </div>
                </div>
              </div>
              <div className="px-3 py-3 border-t border-white/8 shrink-0">
                <div className="flex gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                  <span className="flex-1 text-sm text-white/25">{inputPlaceholder || 'Type a message…'}</span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: accentColor }}>
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
                {showPoweredBy && <p className="text-white/15 text-xs text-center mt-2">Powered by RaxTeam</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Embeddable Widget ─────────────────────────────────────────────────── */}
      <div className={card}>
        <div className={cardHeader}>
          <h2 className="text-sm font-semibold text-gray-800">Embeddable Widget</h2>
          <p className="text-xs text-gray-400 mt-0.5">Embed your org chatbot on any website or use the REST API</p>
        </div>
        <div className={cardBody + ' space-y-5'}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">{widgetEnabled ? 'Widget enabled' : 'Widget disabled'}</p>
              <p className="text-xs text-gray-400 mt-0.5">Allow the chatbot to be embedded via iframe or REST API</p>
            </div>
            <Toggle on={widgetEnabled} onToggle={() => setWidgetEnabled(v => !v)} />
          </div>

          {widgetEnabled && cfg?.widgetToken && (
            <>
              <div>
                <label className={labelCls}>Allowed Origins <span className="normal-case font-normal tracking-normal text-gray-400">(optional, comma-separated)</span></label>
                <input value={widgetAllowedOrigins} onChange={e => setWidgetAllowedOrigins(e.target.value)}
                  className={inputCls} placeholder="https://yoursite.com, https://app.yoursite.com" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={labelCls + ' mb-0'}>Widget Token</label>
                  <button onClick={regenerateToken} disabled={saving}
                    className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors disabled:opacity-50">
                    Regenerate
                  </button>
                </div>
                <div className="flex gap-2">
                  <code className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs text-brand-700 font-mono truncate">
                    {cfg.widgetToken}
                  </code>
                  <button onClick={() => { navigator.clipboard.writeText(cfg.widgetToken!); showToast('Token copied') }}
                    className="px-3 py-2 border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 rounded-xl text-xs text-gray-600 transition-all font-medium">
                    Copy
                  </button>
                </div>
                <p className="text-gray-400 text-xs mt-1.5">Passed in the URL hash — never appears in server logs or Referer headers.</p>
              </div>

              <div>
                <label className={labelCls}>Embed Code (iframe)</label>
                <div className="relative">
                  <pre className="bg-gray-950 border border-gray-800 rounded-xl p-4 text-xs text-emerald-300 font-mono overflow-x-auto whitespace-pre leading-relaxed">{embedCode}</pre>
                  <button onClick={() => { navigator.clipboard.writeText(embedCode); showToast('Copied') }}
                    className="absolute top-2.5 right-2.5 px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white/60 hover:text-white transition-all">
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <label className={labelCls}>REST API</label>
                <div className="relative">
                  <pre className="bg-gray-950 border border-gray-800 rounded-xl p-4 text-xs text-sky-300 font-mono overflow-x-auto whitespace-pre leading-relaxed">{apiExample}</pre>
                  <button onClick={() => { navigator.clipboard.writeText(apiExample); showToast('Copied') }}
                    className="absolute top-2.5 right-2.5 px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white/60 hover:text-white transition-all">
                    Copy
                  </button>
                </div>
              </div>

              {widgetUrl && (
                <a href={widgetUrl} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Preview widget
                </a>
              )}
            </>
          )}

          {widgetEnabled && !cfg?.widgetToken && (
            <p className="text-sm text-gray-500">Save settings to generate your widget token.</p>
          )}
        </div>
      </div>

      {/* ── Save bar ─────────────────────────────────────────────────────────── */}
      <div className={card + ' px-6 py-4 flex flex-wrap items-center gap-3'}>
        <button onClick={save} disabled={saving}
          className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 rounded-xl text-sm font-semibold text-white transition-all shadow-sm">
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        <button onClick={testConnection} disabled={testing || saving}
          className="px-6 py-2.5 border border-gray-200 hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50 rounded-xl text-sm text-gray-600 hover:text-brand-700 font-medium transition-all">
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        {error && (
          <div className="flex items-center gap-2 ml-auto text-sm text-red-600">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 flex items-center gap-2 text-sm px-4 py-3 rounded-xl shadow-lg z-50 ${
          toastType === 'error' ? 'bg-red-600 text-white' : 'bg-gray-900 text-white'
        }`}>
          {toastType === 'success' && (
            <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {toast}
        </div>
      )}
    </div>
  )
}
