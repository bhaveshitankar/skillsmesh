import { useEffect, useRef, useState } from 'react'
import { AI_TARGETS, buildPrompt, launch, nativeShare } from '../lib/aiLaunch'

interface Props {
  skill: { name: string; promptTemplate: string }
  /** Public link to the skill (used when the prompt is too long for a URL). */
  shareUrl: string
  className?: string
}

export default function UseWithAI({ skill, shareUrl, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  function flash(text: string) {
    setMsg(text)
    setTimeout(() => setMsg(''), 4000)
  }

  function go(id: string) {
    const target = AI_TARGETS.find(t => t.id === id)!
    const r = launch(target, buildPrompt(skill), shareUrl)
    setOpen(false)
    if (r.blocked) flash('Popup blocked - allow popups for this site and try again.')
    else if (r.copied) flash(`Full skill copied - paste it into ${target.label}.`)
  }

  async function share() {
    setOpen(false)
    await nativeShare(buildPrompt(skill), skill.name)
  }

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
      >
        ✨ Use with AI
        <span aria-hidden className="text-[10px] opacity-80">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 max-w-[calc(100vw-1.5rem)] bg-white border border-gray-200 rounded-xl shadow-lg py-1.5"
        >
          {canShare && (
            <button
              role="menuitem"
              onClick={share}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50 border-b border-gray-100"
            >
              📲 Share to any app…
            </button>
          )}
          {AI_TARGETS.map(t => (
            <button
              key={t.id}
              role="menuitem"
              onClick={() => go(t.id)}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {msg && (
        <div role="status" className="absolute right-0 top-full mt-2 z-50 w-64 text-xs bg-gray-900 text-white rounded-lg px-3 py-2 shadow-lg">
          {msg}
        </div>
      )}
    </div>
  )
}
