import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RaxTeamLogo from '../components/RaxTeamLogo'

const BADGE_SVG_URL = 'https://img.shields.io/badge/skills%20powered%20by-RaxTeam-6366f1?style=flat&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSI0MCIgeTI9IjQwIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzYzNjZmMSIvPjxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzhiNWNmNiIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcng9IjEwIiBmaWxsPSJ1cmwoI2cpIi8+PC9zdmc+'

const snippets = [
  {
    label: 'Markdown (README)',
    lang: 'markdown',
    code: `[![Powered by RaxTeam](${BADGE_SVG_URL})](https://raxteam.com)`,
  },
  {
    label: 'HTML',
    lang: 'html',
    code: `<a href="https://raxteam.com" target="_blank" rel="noopener">
  <img src="${BADGE_SVG_URL}" alt="Powered by RaxTeam" />
</a>`,
  },
  {
    label: 'MCP config snippet',
    lang: 'json',
    code: `{
  "mcpServers": {
    "raxteam": {
      "command": "npx",
      "args": ["-y", "@raxteam/mcp-server"],
      "env": { "RAXTEAM_API_KEY": "your-api-key" }
    }
  }
}`,
  },
]

export default function BadgePage() {
  const navigate = useNavigate()
  const [copied, setCopied] = useState<string | null>(null)

  function copy(code: string, label: string) {
    navigator.clipboard.writeText(code)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="min-h-screen bg-[#070a10] text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-20 border-b border-white/[0.06] backdrop-blur-md bg-[#070a10]/80 px-6 py-3 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="flex items-center gap-2.5">
          <RaxTeamLogo size={28} />
          <span className="font-bold text-white text-sm">RaxTeam</span>
        </button>
        <button onClick={() => navigate('/login')} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold transition-colors">
          Get started free
        </button>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 text-indigo-400 text-xs font-medium mb-6">
            ✦ Show your stack
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-4">Powered by RaxTeam</h1>
          <p className="text-white/40 text-lg max-w-md mx-auto">
            Add a badge to your README or site to show you're using RaxTeam for AI skill management.
          </p>
        </div>

        {/* Live badge preview */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-8 text-center mb-10">
          <p className="text-xs text-white/30 uppercase tracking-widest mb-4">Preview</p>
          <img src={BADGE_SVG_URL} alt="Powered by RaxTeam" className="mx-auto h-6" />
        </div>

        {/* Snippets */}
        <div className="space-y-4">
          {snippets.map(s => (
            <div key={s.label} className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.05]">
                <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">{s.label}</span>
                <button onClick={() => copy(s.code, s.label)}
                  className="text-xs px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-white/60 hover:text-white transition-all">
                  {copied === s.label ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="px-5 py-4 text-xs text-white/60 overflow-x-auto font-mono leading-relaxed">{s.code}</pre>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <p className="text-white/30 text-sm mb-4">Ready to build your AI skill library?</p>
          <button onClick={() => navigate('/login')}
            className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold transition-all shadow-[0_0_30px_rgba(99,102,241,0.3)]">
            Start for free →
          </button>
        </div>
      </div>
    </div>
  )
}
