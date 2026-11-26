import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'

type Message = { role: 'user' | 'assistant'; content: string; skillsUsed?: string[]; outputType?: string }

const PROVIDER_LABELS: Record<string, string> = {
  cloudflare: 'Cloudflare AI',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  groq: 'Groq',
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3.5">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-brand-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold shadow-sm ${
        isUser
          ? 'bg-gradient-to-br from-brand-500 to-violet-600 text-white'
          : 'bg-white border border-gray-200 text-brand-600'
      }`}>
        {isUser ? 'You' : 'AI'}
      </div>
      <div className={`max-w-[78%] flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-gradient-to-br from-brand-600 to-violet-600 text-white rounded-tr-sm shadow-sm'
            : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
        }`}>
          {msg.outputType === 'image' ? (
            <img src={msg.content} alt="AI generated image" className="max-w-full rounded-lg" />
          ) : msg.outputType === 'audio' ? (
            <audio controls src={msg.content} className="w-full" />
          ) : (
            msg.content
          )}
        </div>
        {msg.skillsUsed && msg.skillsUsed.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {msg.skillsUsed.map(s => (
              <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-700 font-medium">
                ✦ {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [provider, setProvider] = useState('')
  const [isPro, setIsPro] = useState<boolean | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    api.me().then(r => setIsPro(r.org.plan !== 'free')).catch(() => setIsPro(false))
    api.chat.config().then(cfg => setProvider(cfg.provider ?? 'cloudflare')).catch(() => {})
  }, [])

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
      const history = newMessages.slice(-10).map(m => ({ role: m.role, content: m.content }))
      const res = await api.chat.send({ message: msg, history: history.slice(0, -1) })
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply, skillsUsed: res.skillsUsed, outputType: res.outputType }])
      if (res.provider) setProvider(res.provider)
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string }
      setError(err.code === 'PLAN_LIMIT' ? 'upgrade' : (err.message ?? 'Something went wrong'))
      setMessages(prev => prev.slice(0, -1))
      setInput(msg)
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  // Free plan gate
  if (isPro === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-center">
          <svg className="w-8 h-8 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div>
          <h2 className="text-gray-900 font-bold text-xl mb-2">Org Chatbot is a Pro feature</h2>
          <p className="text-gray-500 max-w-sm text-sm leading-relaxed">
            Upgrade to Pro to get an AI chatbot powered by your org's skills, embeddable anywhere on your website or internal tools.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 mt-1">
          <Link
            to="/upgrade"
            className="px-6 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
          >
            Upgrade to Pro →
          </Link>
          <Link
            to="/integration"
            className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors"
          >
            Learn more
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-[#f8f9fb]">

      {/* Header */}
      <div className="flex items-center justify-between px-5 md:px-8 py-4 border-b border-gray-200 bg-white shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-900 leading-none">Org Assistant</h1>
            {provider && (
              <p className="text-xs text-gray-400 mt-0.5">via {PROVIDER_LABELS[provider] ?? provider}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 hover:border-gray-300 rounded-lg transition-all"
            >
              Clear chat
            </button>
          )}
          <Link
            to="/settings/chat"
            className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 px-3 py-1.5 border border-brand-200 hover:border-brand-300 bg-brand-50 hover:bg-brand-100 rounded-lg transition-all font-medium"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Configure
          </Link>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-5 md:px-8 py-6 space-y-4">

        {/* Empty state */}
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center">
              <svg className="w-7 h-7 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div>
              <p className="text-gray-900 font-semibold text-base mb-1.5">Ask your org anything</p>
              <p className="text-gray-500 text-sm max-w-xs leading-relaxed">
                I'll use your org's skills as context to give accurate, relevant answers.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-md mt-1">
              {[
                'What skills do we have?',
                'How do I write a good PR description?',
                'Summarize our code review process',
              ].map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus() }}
                  className="text-xs px-3.5 py-2 bg-white border border-gray-200 hover:border-brand-300 hover:text-brand-700 rounded-full text-gray-600 transition-all shadow-sm hover:shadow"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}

        {/* Typing indicator */}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full shrink-0 bg-white border border-gray-200 flex items-center justify-center text-[11px] font-bold text-brand-600 shadow-sm">
              AI
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm shadow-sm">
              <TypingDots />
            </div>
          </div>
        )}

        {/* Errors */}
        {error === 'upgrade' && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Chat requires a Pro plan. <Link to="/upgrade" className="font-semibold text-amber-900 underline underline-offset-2">Upgrade now →</Link></span>
          </div>
        )}
        {error && error !== 'upgrade' && (
          <div className="flex items-center gap-2 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-5 md:px-8 py-4 border-t border-gray-200 bg-white shrink-0">
        <div className="flex gap-3 items-end bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything… (Enter to send, Shift+Enter for new line)"
            rows={1}
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none leading-relaxed max-h-32"
            style={{ minHeight: '24px' }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="w-8 h-8 shrink-0 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all active:scale-95"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <p className="text-gray-400 text-xs text-center mt-2">AI responses may not always be accurate. Verify important information.</p>
      </div>
    </div>
  )
}
