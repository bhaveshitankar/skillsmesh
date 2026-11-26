import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RaxTeamLogo from '../components/RaxTeamLogo'

const BASE = 'https://api.raxteam.com'

type Endpoint = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  desc: string
  auth: 'none' | 'api-key' | 'bearer'
  example?: string
  response?: string
}

const ENDPOINTS: { section: string; items: Endpoint[] }[] = [
  {
    section: 'Public — No auth required',
    items: [
      {
        method: 'GET', path: '/public/p?q=your+query', auth: 'none',
        desc: 'Resolve a natural language query to the best matching public skill. Returns the prompt template as plain text. Rate limited to 10 req/min.',
        example: `curl "${BASE}/public/p?q=write+a+git+commit+message"`,
        response: `Write Git Commit Message\nGenerates a conventional commit message...\n\nYou are an expert at writing...`,
      },
      {
        method: 'GET', path: '/public/skills', auth: 'none',
        desc: 'Browse paginated public approved skills. Supports ?page=, ?limit=, ?search=, ?tag= filters.',
        example: `curl "${BASE}/public/skills?search=email&limit=10"`,
        response: `{ "skills": [...], "page": 1, "limit": 10 }`,
      },
      {
        method: 'POST', path: '/public/submit', auth: 'none',
        desc: 'Submit a skill anonymously for community review. Rate limited to 3/hour.',
        example: `curl -X POST "${BASE}/public/submit" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Write email","description":"...","promptTemplate":"..."}'`,
        response: `{ "ok": true, "id": "...", "message": "Submitted for review." }`,
      },
    ],
  },
  {
    section: 'Authenticated — API Key',
    items: [
      {
        method: 'POST', path: '/resolve', auth: 'api-key',
        desc: 'Resolve a query using your private + shared skill library. Returns the best match with score.',
        example: `curl -X POST "${BASE}/resolve" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"write a pull request description"}'`,
        response: `{ "found": true, "skill": { "name": "PR Description", ... }, "score": 0.94 }`,
      },
      {
        method: 'GET', path: '/skills', auth: 'api-key',
        desc: 'List skills in your org. Add ?visibility=public|private|shared|all.',
        example: `curl "${BASE}/skills?visibility=all" \\
  -H "Authorization: Bearer sk-your-api-key"`,
        response: `{ "skills": [...] }`,
      },
      {
        method: 'POST', path: '/usage', auth: 'api-key',
        desc: 'Log a skill usage event for analytics.',
        example: `curl -X POST "${BASE}/usage" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{"skillId":"abc","queryText":"...","matchScore":0.9,"tokensUsed":200,"tokensSaved":150,"outcome":"used"}'`,
        response: `{ "ok": true }`,
      },
    ],
  },
]

const methodColor: Record<string, string> = {
  GET: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  POST: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  PATCH: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  DELETE: 'bg-red-500/15 text-red-400 border-red-500/25',
}

export default function ApiDocsPage() {
  const navigate = useNavigate()
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="min-h-screen bg-[#070a10] text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-20 border-b border-white/[0.06] backdrop-blur-md bg-[#070a10]/80 px-6 py-3 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="flex items-center gap-2.5">
          <RaxTeamLogo size={28} />
          <span className="font-bold text-white text-sm">RaxTeam</span>
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/30 hidden sm:block">Base URL: <code className="text-indigo-400">{BASE}</code></span>
          <button onClick={() => navigate('/login')} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold transition-colors">
            Get API key
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 text-indigo-400 text-xs font-medium mb-5">
            ⚡ REST API
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-3">API Reference</h1>
          <p className="text-white/40 text-lg">Integrate RaxTeam skill resolution into any app, agent, or CI pipeline.</p>
        </div>

        {/* Auth note */}
        <div className="bg-indigo-500/8 border border-indigo-500/20 rounded-xl p-5 mb-10">
          <p className="text-sm font-semibold text-indigo-300 mb-1">Authentication</p>
          <p className="text-sm text-white/50">Authenticated endpoints require <code className="text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded text-xs">Authorization: Bearer sk-your-api-key</code>. Get your key from Settings → Integration inside your dashboard.</p>
        </div>

        {ENDPOINTS.map(section => (
          <div key={section.section} className="mb-10">
            <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">{section.section}</p>
            <div className="space-y-2">
              {section.items.map(ep => {
                const key = ep.path
                const isOpen = open === key
                return (
                  <div key={key} className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden">
                    <button onClick={() => setOpen(isOpen ? null : key)} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/[0.02] transition-colors text-left">
                      <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wide ${methodColor[ep.method]}`}>{ep.method}</span>
                      <code className="text-sm text-white/80 flex-1 font-mono">{ep.path}</code>
                      <span className="text-xs text-white/25 hidden sm:block">{ep.desc.slice(0, 50)}…</span>
                      <svg className={`w-4 h-4 text-white/30 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {isOpen && (
                      <div className="border-t border-white/[0.05] px-5 py-5 space-y-4">
                        <p className="text-sm text-white/60">{ep.desc}</p>
                        {ep.example && (
                          <div>
                            <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Example request</p>
                            <pre className="bg-black/40 rounded-lg px-4 py-3 text-xs text-emerald-400 overflow-x-auto font-mono leading-relaxed">{ep.example}</pre>
                          </div>
                        )}
                        {ep.response && (
                          <div>
                            <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Response</p>
                            <pre className="bg-black/40 rounded-lg px-4 py-3 text-xs text-white/60 overflow-x-auto font-mono leading-relaxed">{ep.response}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        <div className="mt-16 text-center border-t border-white/[0.06] pt-10">
          <p className="text-white/30 text-sm mb-1">Need the full OpenAPI spec?</p>
          <a href="https://api.raxteam.com/openapi.json" target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 text-sm underline underline-offset-2">
            Download openapi.json →
          </a>
        </div>
      </div>
    </div>
  )
}
