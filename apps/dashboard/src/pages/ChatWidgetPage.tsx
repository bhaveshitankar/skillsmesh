import { useState, useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import RaxTeamLogo from '../components/RaxTeamLogo'

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://api.raxteam.com'

type Message = { role: 'user' | 'assistant'; content: string; outputType?: string }

type WidgetConfig = {
  chatTitle: string
  botName: string
  welcomeMessage: string
  inputPlaceholder: string
  accentColor: string
  showPoweredBy: boolean
  orgName: string
}

const DEFAULT_CONFIG: WidgetConfig = {
  chatTitle: 'AI Assistant',
  botName: 'Assistant',
  welcomeMessage: 'Hi! How can I help you?',
  inputPlaceholder: 'Type a message…',
  accentColor: '#4f46e5',
  showPoweredBy: true,
  orgName: '',
}

function getToken() {
  const hash = window.location.hash.slice(1)
  const p = new URLSearchParams(hash)
  return p.get('token') ?? ''
}

function TypingDots({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-1 px-3 py-2.5">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ backgroundColor: `${color}99`, animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  )
}

export default function ChatWidgetPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [token] = useState(() => getToken())
  const [wConfig, setWConfig] = useState<WidgetConfig>(DEFAULT_CONFIG)
  const [configLoaded, setConfigLoaded] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!orgSlug) { setConfigLoaded(true); return }
    fetch(`${API_BASE}/public/chat/${orgSlug}/config`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setWConfig({ ...DEFAULT_CONFIG, ...data }) })
      .catch(() => {})
      .finally(() => setConfigLoaded(true))
  }, [orgSlug])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    setError('')

    const newMessages: Message[] = [...messages, { role: 'user', content: msg }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/public/chat/${orgSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          message: msg,
          history: newMessages.slice(-6, -1).map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json() as { reply?: string; error?: string; outputType?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to get response')
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply!, outputType: data.outputType }])
    } catch (e: unknown) {
      setError((e as Error).message)
      setMessages(prev => prev.slice(0, -1))
      setInput(msg)
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); send() }
  }

  const isEmbedded = window.self !== window.top
  const { chatTitle, botName, welcomeMessage, inputPlaceholder, accentColor, showPoweredBy } = wConfig

  if (!configLoaded) return (
    <div className="flex items-center justify-center h-screen bg-[#0d0f16]">
      <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
    </div>
  )

  return (
    <div
      className={`flex flex-col bg-[#0d0f16] text-white ${isEmbedded ? 'h-screen' : 'min-h-screen max-w-md mx-auto'}`}
      style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8 shrink-0" style={{ background: '#0d0f16' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-sm"
          style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}99)` }}>
          {chatTitle[0]?.toUpperCase() ?? 'A'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-none">{chatTitle}</p>
          <p className="text-white/30 text-xs mt-0.5">{botName}</p>
        </div>
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Online" />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-8">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}30` }}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                style={{ color: accentColor }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <p className="text-white/60 text-sm font-medium">{welcomeMessage}</p>
            <p className="text-white/25 text-xs max-w-[200px]">Ask me anything — I know this organization's skills and knowledge.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center mt-0.5 text-white text-[10px] font-bold"
                style={{ background: accentColor }}>
                {botName[0]?.toUpperCase() ?? 'A'}
              </div>
            )}
            <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'text-white rounded-tr-sm'
                : 'bg-white/8 border border-white/6 text-white/85 rounded-tl-sm'
            }`} style={msg.role === 'user' ? { background: accentColor } : {}}>
              {msg.outputType === 'image' ? (
                <img src={msg.content} alt="AI generated image" className="max-w-full rounded-lg" />
              ) : msg.outputType === 'audio' ? (
                <audio controls src={msg.content} className="w-full" />
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
              style={{ background: accentColor }}>
              {botName[0]?.toUpperCase() ?? 'A'}
            </div>
            <div className="bg-white/8 border border-white/6 rounded-2xl rounded-tl-sm">
              <TypingDots color={accentColor} />
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 text-center py-1">{error}</div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-white/8 shrink-0">
        <div className="flex gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2"
          style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
          onFocus={e => (e.currentTarget.style.borderColor = `${accentColor}60`)}
          onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={inputPlaceholder}
            className="flex-1 bg-transparent text-sm text-white placeholder-white/25 focus:outline-none"
            autoFocus
          />
          <button onClick={send} disabled={!input.trim() || loading}
            className="w-7 h-7 rounded-lg disabled:opacity-30 flex items-center justify-center transition-all shrink-0"
            style={{ background: accentColor }}>
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        {showPoweredBy && (
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <RaxTeamLogo size={12} />
            <span className="text-white/15 text-xs">Powered by RaxTeam</span>
          </div>
        )}
      </div>
    </div>
  )
}
