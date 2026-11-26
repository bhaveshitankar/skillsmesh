import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getToken, api, type Org } from '../lib/api'

const API_URL = import.meta.env.VITE_API_URL ?? 'https://api.raxteam.com'

function CodeBlock({ code, lang = 'bash' }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div className="relative group">
      <pre className={`bg-slate-950 text-slate-300 rounded-xl p-4 text-xs leading-relaxed overflow-x-auto font-mono border border-slate-800 language-${lang}`}>
        {code}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium transition-all"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-5">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-brand-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
          {n}
        </div>
        <div className="flex-1 w-px bg-gray-200 mt-2 mb-0" />
      </div>
      <div className="pb-10 flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 leading-none pt-1.5">{title}</h3>
        {children}
      </div>
    </div>
  )
}

export default function IntegrationPage() {
  const [realApiKey, setRealApiKey] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'llm' | 'curl' | 'python' | 'mcp' | 'widget'>('llm')
  const [org, setOrg] = useState<Org | null>(null)
  const [widgetToken, setWidgetToken] = useState<string | null>(null)

  useEffect(() => {
    api.myApiKey().then(r => setRealApiKey(r.apiKey)).catch(() => {})
    api.me().then(r => setOrg(r.org)).catch(() => {})
    api.chat.config().then(c => setWidgetToken(c.widgetToken)).catch(() => {})
  }, [])

  const isPro = org?.plan !== 'free'
  const maskedKey = realApiKey ? `${realApiKey.slice(0, 8)}${'•'.repeat(24)}` : '••••••••••••••••••••••••••••••••'
  const displayKey = revealed && realApiKey ? realApiKey : maskedKey

  function copyKey() {
    if (!realApiKey) return
    navigator.clipboard.writeText(realApiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const apiKey = realApiKey ?? (getToken() ?? 'sk-your-api-key')
  const orgSlug = org?.slug ?? 'your-org-slug'
  const wToken = widgetToken ?? 'your-widget-token'
  const widgetUrl = `https://raxteam.com/chat/${orgSlug}#token=${wToken}`

  const tabs = [
    { id: 'llm' as const, label: 'LLM Config' },
    { id: 'curl' as const, label: 'cURL / HTTP' },
    { id: 'python' as const, label: 'Python' },
    { id: 'mcp' as const, label: 'MCP Server' },
    { id: 'widget' as const, label: '💬 Chat Widget', pro: true },
  ]

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Integration Guide</h1>
        <p className="text-sm text-gray-500 mt-1">Connect your LLM to RaxTeam in under 5 minutes</p>
      </div>

      {/* API Key banner */}
      <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4 mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <p className="text-xs font-semibold text-brand-700">Your API key</p>
          </div>
          <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">Keep secret</span>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs text-brand-800 font-mono bg-white border border-brand-100 rounded-lg px-3 py-2 select-all min-w-0 overflow-hidden">
            {displayKey}
          </code>
          <button
            onClick={() => setRevealed(r => !r)}
            className="shrink-0 px-2.5 py-2 border border-brand-200 text-brand-500 hover:text-brand-700 hover:bg-brand-100 rounded-lg text-xs transition-colors"
            title={revealed ? 'Hide' : 'Reveal'}
          >
            {revealed ? '🙈' : '👁'}
          </button>
          <button
            onClick={copyKey}
            disabled={!realApiKey}
            className="shrink-0 px-2.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-brand-500 mt-2">Use as <code className="font-mono">Authorization: Bearer &lt;key&gt;</code> on every request.</p>
      </div>

      {/* How it works */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: '🗣️', title: 'User asks', desc: 'User sends a natural-language request to your LLM' },
            { icon: '🔍', title: 'Resolve skill', desc: 'Your LLM calls /resolve to find the best matching prompt template' },
            { icon: '🚀', title: 'Use template', desc: 'LLM fills variables and calls the AI with the approved prompt' },
          ].map(item => (
            <div key={item.title} className="text-center p-4 bg-gray-50 rounded-xl">
              <div className="text-2xl mb-2">{item.icon}</div>
              <p className="text-xs font-semibold text-gray-800 mb-1">{item.title}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pro chat widget promo banner */}
      {!isPro ? (
        <div className="relative overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-5 mb-6">
          <div className="absolute -top-6 -right-6 w-32 h-32 bg-indigo-200/40 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-lg shrink-0">💬</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-bold text-gray-900">Org Chat Widget — new Pro feature</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold">Pro</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed mb-3">
                Give your team — and your customers — a fully branded AI chatbot powered by your org's skills. Embed it on any website with one line of code. No backend needed.
              </p>
              <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-4">
                {['Embed on any site (iframe)', 'REST API for custom frontends', 'Scoped to your org\'s skills', 'Bring your own LLM key'].map(f => (
                  <span key={f} className="flex items-center gap-1"><span className="text-indigo-500">✓</span>{f}</span>
                ))}
              </div>
              <Link to="/upgrade" className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold rounded-xl transition-all shadow-sm">
                Upgrade to Pro → unlock Chat Widget
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-6 text-xs text-emerald-700">
          <span className="text-base">✓</span>
          <span><strong>Chat Widget is active</strong> on your plan. Configure it in <Link to="/settings/chat" className="underline font-medium">Chat Settings</Link> and see docs below in the <button onClick={() => setActiveTab('widget')} className="underline font-medium">Chat Widget tab</button>.</span>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-max px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 justify-center ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.pro && <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-100 text-indigo-600 font-bold leading-none">PRO</span>}
          </button>
        ))}
      </div>

      {/* LLM system prompt tab */}
      {activeTab === 'llm' && (
        <div className="space-y-6">
          <p className="text-sm text-gray-600 leading-relaxed">
            Add this to your LLM's system prompt. The model will call <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">/resolve</code> when it needs a skill, then use the returned template.
          </p>

          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">System prompt snippet</p>
            <CodeBlock lang="markdown" code={`You have access to RaxTeam, a curated library of approved AI prompt templates.

When the user asks you to perform a task, first call the RaxTeam resolver to find the best matching skill:

  POST ${API_URL}/resolve
  Authorization: Bearer ${apiKey}
  Content-Type: application/json
  {"query": "<what the user wants to do>", "topK": 3}

If a skill is found (found: true), use the returned promptTemplate, replacing
{{variableName}} placeholders with values from the user's request.

If no skill is found, handle the request yourself as usual.`} />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Resolver response shape</p>
            <CodeBlock lang="json" code={`{
  "found": true,
  "match": {
    "id": "skill_abc123",
    "name": "Summarize Support Ticket",
    "promptTemplate": "Summarize this support ticket in {{language}}:\\n\\n{{ticket}}",
    "score": 0.91,
    "triggers": ["summarize ticket", "support summary"]
  },
  "topCandidates": [...]
}`} />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700">
            <strong>Tip:</strong> Keep your query short and action-focused — e.g. <em>"summarize a support ticket"</em>, not the full user message. This gives the resolver the best match accuracy.
          </div>
        </div>
      )}

      {/* cURL tab */}
      {activeTab === 'curl' && (
        <div className="space-y-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Resolve a skill</p>
            <CodeBlock code={`curl -X POST ${API_URL}/resolve \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "summarize a support ticket", "topK": 3}'`} />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">List your skills</p>
            <CodeBlock code={`curl ${API_URL}/skills \\
  -H "Authorization: Bearer ${apiKey}"`} />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Log usage after running a skill</p>
            <CodeBlock code={`curl -X POST ${API_URL}/usage \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"skillId": "skill_abc123", "tokensUsed": 340, "latencyMs": 820}'`} />
          </div>
        </div>
      )}

      {/* Python tab */}
      {activeTab === 'python' && (
        <div className="space-y-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Installation</p>
            <CodeBlock code="pip install httpx" />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Full integration example</p>
            <CodeBlock lang="python" code={`import httpx
import openai  # or any OpenAI-compatible client

RAXTEAM_URL = "${API_URL}"
RAXTEAM_KEY = "${apiKey}"

def resolve_skill(query: str) -> dict | None:
    resp = httpx.post(
        f"{RAXTEAM_URL}/resolve",
        headers={"Authorization": f"Bearer {RAXTEAM_KEY}"},
        json={"query": query, "topK": 3},
        timeout=5,
    )
    data = resp.json()
    return data.get("match") if data.get("found") else None

def fill_template(template: str, variables: dict) -> str:
    for key, value in variables.items():
        template = template.replace("{{" + key + "}}", str(value))
    return template

# Example usage
user_request = "Summarize this ticket: Customer can't log in since yesterday."

skill = resolve_skill("summarize a support ticket")
if skill:
    prompt = fill_template(skill["promptTemplate"], {
        "ticket": user_request,
        "language": "English",
    })
else:
    prompt = user_request  # fallback

client = openai.OpenAI(api_key="your-llm-key")
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": prompt}],
)
print(response.choices[0].message.content)`} />
          </div>
        </div>
      )}

      {/* MCP tab */}
      {activeTab === 'mcp' && (
        <div className="space-y-6">
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-xs text-violet-700">
            <strong>Coming soon</strong> — the RaxTeam MCP server will let any MCP-compatible LLM (Claude, Cursor, etc.) use your org's skills automatically.
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Claude Desktop config (preview)</p>
              <CodeBlock lang="json" code={`// ~/.config/claude/claude_desktop_config.json
{
  "mcpServers": {
    "raxteam": {
      "command": "npx",
      "args": ["-y", "@raxteam/mcp"],
      "env": {
        "RAXTEAM_API_KEY": "${apiKey}",
        "RAXTEAM_API_URL": "${API_URL}"
      }
    }
  }
}`} />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cursor / Windsurf config (preview)</p>
              <CodeBlock lang="json" code={`// .cursor/mcp.json (in your project root)
{
  "mcpServers": {
    "raxteam": {
      "command": "npx",
      "args": ["-y", "@raxteam/mcp"],
      "env": {
        "RAXTEAM_API_KEY": "${apiKey}",
        "RAXTEAM_API_URL": "${API_URL}"
      }
    }
  }
}`} />
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Once installed, your LLM will automatically see <code className="font-mono bg-gray-100 px-1 rounded">resolve_skill</code> and <code className="font-mono bg-gray-100 px-1 rounded">list_skills</code> as tools.
          </p>
        </div>
      )}

      {/* Chat Widget tab */}
      {activeTab === 'widget' && (
        <div className="space-y-6">
          {!isPro ? (
            <div className="text-center py-12 space-y-4">
              <div className="text-5xl">💬</div>
              <p className="text-gray-700 font-semibold">Chat Widget is a Pro feature</p>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">Upgrade to embed a fully branded AI chatbot — powered by your skills — on any website.</p>
              <Link to="/upgrade" className="inline-block px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">
                Upgrade to Pro →
              </Link>
            </div>
          ) : (
            <>
              {/* Security callout */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5">🔒 Security model — read this first</p>
                <ul className="text-xs text-amber-700 space-y-1.5 leading-relaxed">
                  <li><strong>Widget token ≠ API key.</strong> The widget token only grants access to the public chat endpoint for your org. It cannot read skills, modify data, or access billing. If leaked, regenerate it instantly in <Link to="/settings/chat" className="underline">Chat Settings</Link>.</li>
                  <li><strong>Token in URL hash.</strong> The token is passed in the URL hash (<code className="font-mono bg-amber-100 px-1 rounded">#token=…</code>), which browsers never send in <code className="font-mono bg-amber-100 px-1 rounded">Referer</code> headers or server logs — keeping it out of your analytics and CDN logs.</li>
                  <li><strong>Your LLM API key stays server-side.</strong> It is stored encrypted in Cloudflare's secret store and is never returned to the browser or included in any API response.</li>
                  <li><strong>Org-scoped context.</strong> The chatbot only sees skills approved for your org. No cross-org data leakage is possible — every request is scoped to the org identified by the slug.</li>
                  <li><strong>Allowed origins.</strong> Set an origin allowlist in <Link to="/settings/chat" className="underline">Chat Settings</Link> to restrict which domains can call the public chat API.</li>
                </ul>
              </div>

              {/* Iframe embed */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Embed as iframe (simplest)</p>
                <CodeBlock lang="html" code={`<!-- Paste anywhere in your HTML -->
<iframe
  src="${widgetUrl}"
  width="400"
  height="600"
  style="border:none;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.15)"
  allow="clipboard-write">
</iframe>`} />
                <p className="text-xs text-gray-400 mt-1">
                  The token lives in the URL hash — never sent to your server or any log.{' '}
                  <a href={widgetUrl} target="_blank" rel="noreferrer" className="text-indigo-500 underline">Preview widget ↗</a>
                </p>
              </div>

              {/* Floating bubble */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Floating chat bubble (JavaScript)</p>
                <CodeBlock lang="html" code={`<script>
  (function() {
    var btn = document.createElement('button');
    btn.innerHTML = '💬';
    btn.style.cssText = 'position:fixed;bottom:24px;right:24px;width:56px;height:56px;' +
      'border-radius:50%;background:linear-gradient(135deg,#6366f1,#7c3aed);' +
      'color:#fff;font-size:24px;border:none;cursor:pointer;' +
      'box-shadow:0 4px 24px rgba(99,102,241,0.4);z-index:9999';
    var open = false;
    var frame;
    btn.onclick = function() {
      if (!frame) {
        frame = document.createElement('iframe');
        frame.src = '${widgetUrl}';
        frame.style.cssText = 'position:fixed;bottom:96px;right:24px;width:380px;' +
          'height:560px;border:none;border-radius:16px;' +
          'box-shadow:0 8px 40px rgba(0,0,0,0.2);z-index:9998';
        document.body.appendChild(frame);
      }
      open = !open;
      frame.style.display = open ? 'block' : 'none';
      btn.innerHTML = open ? '✕' : '💬';
    };
    document.body.appendChild(btn);
  })();
</script>`} />
              </div>

              {/* REST API */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">REST API — build your own UI</p>
                <CodeBlock code={`curl -X POST https://api.raxteam.com/public/chat/${orgSlug} \\
  -H "Content-Type: application/json" \\
  -d '{
    "token": "${wToken}",
    "message": "How do I write a good PR description?",
    "history": [
      {"role": "user", "content": "Previous message"},
      {"role": "assistant", "content": "Previous reply"}
    ]
  }'`} />
                <CodeBlock lang="json" code={`// Response
{
  "reply": "A good PR description should include...",
  "skillsUsed": ["PR Review Checklist", "Code Review Guidelines"]
}`} />
              </div>

              {/* React example */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">React integration example</p>
                <CodeBlock lang="jsx" code={`const WIDGET_TOKEN = '${wToken}' // store in env, not hardcoded
const ORG_SLUG = '${orgSlug}'

async function sendMessage(message, history = []) {
  const res = await fetch(
    \`https://api.raxteam.com/public/chat/\${ORG_SLUG}\`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: WIDGET_TOKEN, message, history }),
    }
  )
  if (!res.ok) throw new Error('Chat request failed')
  const data = await res.json()
  return data.reply  // string — the AI response
}`} />
              </div>

              {/* Security checklist */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-600">Security checklist before going live</p>
                <ul className="space-y-1.5">
                  {[
                    'Store the widget token in an environment variable, not hardcoded in source',
                    'Set allowed origins in Chat Settings to your production domain only',
                    'Test with a free-tier account first to verify your skills are scoped correctly',
                    'Rotate the widget token if you suspect it has been exposed',
                    'Do not log or cache the full widget URL server-side — the hash fragment is security-sensitive',
                  ].map(item => (
                    <li key={item} className="flex items-start gap-2 text-xs text-gray-600">
                      <span className="text-indigo-500 shrink-0 mt-0.5">☐</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex gap-3">
                <Link to="/settings/chat" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-colors">
                  Configure Chat Settings →
                </Link>
                <Link to="/chat" className="px-4 py-2 border border-gray-200 text-gray-600 hover:text-gray-900 text-xs font-semibold rounded-xl transition-colors">
                  Open org chatbot
                </Link>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step-by-step */}
      <div className="mt-10">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-6">Quick-start steps</h2>
        <div>
          <Step n={1} title="Create and approve a skill">
            Go to <strong>Skills → New Skill</strong>. Add a name, description, prompt template with <code className="text-xs bg-gray-100 px-1 rounded font-mono">{'{{variables}}'}</code>, and triggers. Submit it for review and approve it.
          </Step>
          <Step n={2} title="Copy your API key">
            Your key is shown above. Keep it secret — treat it like a password.
          </Step>
          <Step n={3} title="Call /resolve from your LLM">
            Send the user's intent (not the full message) as the query. Receive the best matching prompt template with a confidence score.
          </Step>
          <Step n={4} title="Fill variables and run">
            Replace <code className="text-xs bg-gray-100 px-1 rounded font-mono">{'{{varName}}'}</code> placeholders in the template with values from context, then call your AI provider with the filled prompt.
          </Step>
          <Step n={5} title="Log usage (optional)">
            <code className="text-xs bg-gray-100 px-1 rounded font-mono">POST /usage</code> with <code className="text-xs bg-gray-100 px-1 rounded font-mono">skillId</code> and <code className="text-xs bg-gray-100 px-1 rounded font-mono">tokensUsed</code> to track analytics per skill.
          </Step>
          <Step n={6} title="Embed the Chat Widget on your site (Pro)">
            Go to <Link to="/settings/chat" className="font-medium text-indigo-600 underline">Chat Settings</Link> to pick your LLM provider, set a system prompt, and enable the widget. Copy the iframe snippet or use the <button onClick={() => setActiveTab('widget')} className="font-medium text-indigo-600 underline">Chat Widget docs</button> above to integrate via REST API into any frontend.
          </Step>
        </div>
      </div>

    </div>
  )
}
