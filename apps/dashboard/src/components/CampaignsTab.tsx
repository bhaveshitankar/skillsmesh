import { useState, useEffect, useRef } from 'react'
import { SA_API, getSAToken } from '../lib/superadmin'

// ── Types ─────────────────────────────────────────────────────────────────────

type Campaign = {
  id: string; name: string; transport: string; status: 'running' | 'completed' | 'failed'
  subject: string; totalRows: number; sentCount: number; failedCount: number
  createdAt: number; completedAt: number | null; reportKey: string | null
  fromName?: string
}

type Template = {
  id: string; name: string; transport: string; subject: string; body: string
  variables: string[]; createdAt: number
}

type UploadResult = {
  fileKey: string; headers: string[]; preview: Record<string, string>[]; totalRows: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function saFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SA_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${getSAToken()}`, ...(init?.headers ?? {}) },
  })
}

async function saJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await saFetch(path, init)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

const TRANSPORT_ICONS: Record<string, string> = { email: '✉️', sms: '💬', whatsapp: '🟢' }
const STATUS_STYLES: Record<string, string> = {
  running:   'bg-amber-500/15 text-amber-300 border-amber-500/25',
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  failed:    'bg-red-500/15 text-red-400 border-red-500/25',
}

function fmt(n: number) { return new Date(n).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }

// ── Main component ────────────────────────────────────────────────────────────

export default function CampaignsTab() {
  const [view, setView] = useState<'campaigns' | 'templates'>('campaigns')

  return (
    <div className="space-y-4">
      {/* Sub-nav */}
      <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1 w-fit">
        {(['campaigns', 'templates'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${view === v ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25' : 'text-slate-500 hover:text-slate-200'}`}>
            {v === 'campaigns' ? '📣 Campaigns' : '📝 Templates'}
          </button>
        ))}
      </div>

      {view === 'campaigns' && <CampaignsList />}
      {view === 'templates' && <TemplatesList />}
    </div>
  )
}

// ── Campaigns List ────────────────────────────────────────────────────────────

function CampaignsList() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)

  useEffect(() => {
    saJSON<{ campaigns: Campaign[] }>('/campaigns')
      .then(d => setCampaigns(d.campaigns ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function onCreated(c: Campaign) {
    setCampaigns(prev => [c, ...prev])
    setShowWizard(false)
  }

  async function deleteCampaign(id: string) {
    if (!confirm('Delete this campaign and its report?')) return
    await saFetch(`/campaigns/${id}`, { method: 'DELETE' })
    setCampaigns(prev => prev.filter(c => c.id !== id))
  }

  async function downloadReport(campaign: Campaign) {
    const res = await saFetch(`/campaigns/${campaign.id}/report`)
    if (!res.ok) { alert('Report not available'); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `report-${campaign.name}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (showWizard) return <CampaignWizard onDone={onCreated} onCancel={() => setShowWizard(false)} />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white">Campaigns</h3>
          <p className="text-xs text-slate-500 mt-0.5">{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} total</p>
        </div>
        <button onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 rounded-xl text-sm font-semibold text-white transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)]">
          <span className="text-base leading-none">+</span> New Campaign
        </button>
      </div>

      {loading && <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-white/[0.02] rounded-xl animate-pulse" />)}</div>}

      {!loading && campaigns.length === 0 && (
        <div className="text-center py-16 bg-white/[0.02] border border-white/[0.05] rounded-2xl">
          <div className="text-4xl mb-3">📣</div>
          <p className="text-white/60 font-medium">No campaigns yet</p>
          <p className="text-white/25 text-sm mt-1">Upload a CSV and send your first campaign</p>
          <button onClick={() => setShowWizard(true)} className="mt-4 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 rounded-xl text-sm font-semibold text-white transition-all">Create campaign</button>
        </div>
      )}

      {campaigns.map(c => (
        <div key={c.id} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5 hover:border-white/[0.12] transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                <span className="text-lg">{TRANSPORT_ICONS[c.transport] ?? '📨'}</span>
                <h4 className="text-sm font-bold text-white truncate">{c.name}</h4>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wide ${STATUS_STYLES[c.status]}`}>{c.status}</span>
              </div>
              <p className="text-xs text-white/40 truncate mb-3">{c.subject}</p>

              {/* Stats row */}
              <div className="flex items-center gap-4 text-xs">
                <span className="text-white/50">Total <strong className="text-white">{c.totalRows}</strong></span>
                <span className="text-emerald-400">✓ {c.sentCount} sent</span>
                {c.failedCount > 0 && <span className="text-red-400">✗ {c.failedCount} failed</span>}
                {c.sentCount > 0 && <span className="text-white/25">{Math.round(c.sentCount / c.totalRows * 100)}% delivered</span>}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              <p className="text-[10px] text-white/25">{fmt(c.createdAt)}</p>
              <div className="flex gap-2">
                {c.status === 'completed' && c.reportKey && (
                  <button onClick={() => downloadReport(c)}
                    className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium transition-all">
                    ↓ Report
                  </button>
                )}
                <button onClick={() => deleteCampaign(c.id)}
                  className="px-3 py-1.5 bg-red-500/8 border border-red-500/15 hover:bg-red-500/15 text-red-400 rounded-lg text-xs font-medium transition-all">
                  Delete
                </button>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          {c.totalRows > 0 && (
            <div className="mt-4 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
                style={{ width: `${(c.sentCount / c.totalRows) * 100}%` }} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Campaign Creation Wizard ──────────────────────────────────────────────────

function CampaignWizard({ onDone, onCancel }: { onDone: (c: Campaign) => void; onCancel: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [inputMode, setInputMode] = useState<'csv' | 'quick'>('csv')
  const [upload, setUpload] = useState<UploadResult | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTpl, setSelectedTpl] = useState<string>('')
  const [subject, setSubject] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [fromName, setFromName] = useState('RaxTeam')
  const [campaignName, setCampaignName] = useState('')
  const [transport] = useState('email')
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Quick-entry state: fieldName → comma-separated string
  const [quickFields, setQuickFields] = useState<Record<string, string>>({ email: '', name: '' })
  const [quickTpl, setQuickTpl] = useState<string>('')

  useEffect(() => {
    saJSON<{ templates: Template[] }>('/templates').then(d => setTemplates(d.templates ?? [])).catch(() => {})
  }, [])

  // When template selected, fill subject/body
  useEffect(() => {
    if (selectedTpl) {
      const tpl = templates.find(t => t.id === selectedTpl)
      if (tpl) { setSubject(tpl.subject); setHtmlBody(tpl.body) }
    }
  }, [selectedTpl, templates])

  // When a quick-entry template is selected, derive the required fields from its variables
  useEffect(() => {
    if (!quickTpl) return
    const tpl = templates.find(t => t.id === quickTpl)
    if (!tpl) return
    const vars = [...new Set([...(tpl.subject + tpl.body).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))]
    // Always ensure email + name first, then other vars
    const fields: string[] = ['email', 'name', ...vars.filter(v => v !== 'email' && v !== 'name')]
    setQuickFields(prev => Object.fromEntries(fields.map(f => [f, prev[f] ?? ''])))
  }, [quickTpl, templates])

  // Build CSV text from quick-entry fields and upload it
  async function handleQuickUpload() {
    const fields = Object.keys(quickFields)
    if (!quickFields.email?.trim()) { setError('email field is required'); return }

    // Split each field's comma-separated values into an array
    const columns = fields.map(f =>
      quickFields[f].split(',').map(v => v.trim()).filter(v => v)
    )
    const rowCount = Math.max(...columns.map(c => c.length))
    if (rowCount === 0) { setError('Enter at least one value in each field'); return }

    // Build CSV text
    const escVal = (v: string) => `"${v.replace(/"/g, '""')}"`
    const headerRow = fields.map(escVal).join(',')
    const dataRows = Array.from({ length: rowCount }, (_, i) =>
      columns.map(col => escVal(col[i] ?? col[col.length - 1] ?? '')).join(',')
    )
    const csvText = [headerRow, ...dataRows].join('\n')

    setUploading(true); setError('')
    try {
      const blob = new Blob([csvText], { type: 'text/csv' })
      const file = new File([blob], 'quick-entry.csv', { type: 'text/csv' })
      const formData = new FormData()
      formData.append('file', file)
      const res = await saFetch('/csv/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error(await res.text())
      const data: UploadResult = await res.json()
      setUpload(data)
      // Pre-fill template selection and campaign name from quick-entry template
      if (quickTpl) {
        setSelectedTpl(quickTpl)
        const tpl = templates.find(t => t.id === quickTpl)
        if (tpl) { setSubject(tpl.subject); setHtmlBody(tpl.body) }
        setCampaignName(tpl?.name ?? 'Quick campaign')
      }
      setStep(2)
    } catch (e) { setError((e as Error).message) }
    finally { setUploading(false) }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await saFetch('/csv/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error(await res.text())
      const data: UploadResult = await res.json()
      setUpload(data)
      setCampaignName(file.name.replace(/\.csv$/i, ''))
    } catch (e) { setError((e as Error).message) }
    finally { setUploading(false) }
  }

  async function send() {
    setSending(true); setError('')
    try {
      const res = await saFetch('/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: campaignName, transport, fileKey: upload!.fileKey, templateId: selectedTpl || undefined, subject, htmlBody, fromName }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json() as { ok: boolean; campaignId: string; sentCount: number; failedCount: number; totalRows: number }
      onDone({ id: data.campaignId, name: campaignName, transport, status: data.failedCount === data.totalRows ? 'failed' : 'completed', subject, totalRows: data.totalRows, sentCount: data.sentCount, failedCount: data.failedCount, createdAt: Date.now(), completedAt: Date.now(), reportKey: `sa:rpt:${data.campaignId}` })
    } catch (e) { setError((e as Error).message) }
    finally { setSending(false) }
  }

  const emailVars = upload?.headers ?? []
  const vars = [...new Set([...emailVars, ...[...subject.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]), ...[...htmlBody.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1])])]

  return (
    <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-4">
          {([1, 2, 3] as const).map(n => (
            <div key={n} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${step === n ? 'bg-amber-500 border-amber-500 text-black' : step > n ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-white/[0.05] border-white/10 text-white/30'}`}>
                {step > n ? '✓' : n}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${step === n ? 'text-amber-300' : step > n ? 'text-emerald-400' : 'text-white/25'}`}>
                {n === 1 ? 'Contacts' : n === 2 ? 'Compose' : 'Send'}
              </span>
              {n < 3 && <div className="w-8 h-px bg-white/[0.08] hidden sm:block" />}
            </div>
          ))}
        </div>
        <button onClick={onCancel} className="text-white/30 hover:text-white transition-colors text-xl leading-none">×</button>
      </div>

      <div className="p-6">
        {error && <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">{error}</div>}

        {/* Step 1: contacts */}
        {step === 1 && (
          <div className="space-y-5">

            {/* Mode toggle */}
            <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.07] rounded-xl p-1 w-fit">
              {([['csv', '📁 Upload CSV'], ['quick', '⚡ Quick entry']] as const).map(([m, label]) => (
                <button key={m} onClick={() => { setInputMode(m); setUpload(null); setError('') }}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${inputMode === m ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25' : 'text-slate-500 hover:text-slate-300'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── CSV upload mode ── */}
            {inputMode === 'csv' && (
              <>
                <p className="text-sm text-white/40">Must have an <code className="text-amber-400 bg-amber-500/10 px-1 rounded">email</code> column. Add any custom columns — they become template variables.</p>

                <div onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-white/10 hover:border-amber-500/40 rounded-2xl p-10 text-center cursor-pointer transition-all group">
                  <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">📁</div>
                  <p className="text-sm font-medium text-white/60 group-hover:text-white transition-colors">{uploading ? 'Uploading…' : 'Click to upload CSV'}</p>
                  <p className="text-xs text-white/25 mt-1">Max 5 MB · UTF-8 encoded</p>
                  <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
                </div>

                {upload && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                      <span className="text-emerald-400 text-lg">✓</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-emerald-300">{upload.totalRows.toLocaleString()} contacts loaded</p>
                        <p className="text-xs text-emerald-600 mt-0.5">Columns: {upload.headers.join(', ')}</p>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/[0.05] bg-white/[0.02]">
                            {upload.headers.map(h => <th key={h} className="px-3 py-2.5 text-left text-white/40 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {upload.preview.map((row, i) => (
                            <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                              {upload.headers.map(h => <td key={h} className="px-3 py-2.5 text-white/60 whitespace-nowrap max-w-[160px] truncate">{row[h]}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {upload.totalRows > 5 && <p className="px-3 py-2 text-xs text-white/20 border-t border-white/[0.04]">Showing 5 of {upload.totalRows} rows</p>}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <button onClick={onCancel} className="px-5 py-2.5 text-sm text-white/40 hover:text-white transition-colors">Cancel</button>
                  <button disabled={!upload} onClick={() => setStep(2)}
                    className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-all">
                    Next →
                  </button>
                </div>
              </>
            )}

            {/* ── Quick entry mode ── */}
            {inputMode === 'quick' && (
              <>
                <div>
                  <p className="text-sm text-white/40 mb-4">Select a template to see which fields are needed, then type comma-separated values for each field. One row per comma-value.</p>

                  {/* Template picker */}
                  <div className="mb-5">
                    <label className="block text-xs font-semibold text-white/40 mb-2">Template (optional — sets fields automatically)</label>
                    <select value={quickTpl} onChange={e => setQuickTpl(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all">
                      <option value="">— Pick a template —</option>
                      {templates.filter(t => t.transport === 'email').map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Field inputs */}
                  <div className="space-y-3">
                    {Object.keys(quickFields).map(field => {
                      const vals = quickFields[field].split(',').map(v => v.trim()).filter(Boolean)
                      const isEmail = field === 'email'
                      return (
                        <div key={field}>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-semibold text-white/50 flex items-center gap-1.5">
                              <code className="text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px]">{'{{'+field+'}}'}</code>
                              {isEmail && <span className="text-red-400 text-[10px]">required</span>}
                            </label>
                            {vals.length > 0 && <span className="text-[10px] text-white/25">{vals.length} value{vals.length !== 1 ? 's' : ''}</span>}
                          </div>
                          <input
                            value={quickFields[field]}
                            onChange={e => setQuickFields(prev => ({ ...prev, [field]: e.target.value }))}
                            placeholder={
                              field === 'email' ? 'alice@example.com, bob@example.com, carol@example.com' :
                              field === 'name'  ? 'Alice, Bob, Carol' :
                              `value1, value2, value3`
                            }
                            className={`w-full bg-white/[0.04] border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/15 focus:outline-none focus:ring-2 transition-all font-mono ${isEmail && !quickFields[field].trim() ? 'border-red-500/30 focus:ring-red-500/30' : 'border-white/10 focus:ring-amber-500/40'}`}
                          />
                        </div>
                      )
                    })}
                  </div>

                  {/* Add custom field */}
                  <button
                    onClick={() => {
                      const name = prompt('Field name (no spaces, e.g. company):')
                      if (name && /^\w+$/.test(name) && !(name in quickFields))
                        setQuickFields(prev => ({ ...prev, [name]: '' }))
                    }}
                    className="mt-3 text-xs text-white/30 hover:text-amber-400 transition-colors flex items-center gap-1.5">
                    + add custom field
                  </button>

                  {/* Live preview */}
                  {(() => {
                    const emailVals = quickFields.email?.split(',').map(v => v.trim()).filter(Boolean) ?? []
                    const rowCount = Math.max(...Object.values(quickFields).map(v => v.split(',').filter(x => x.trim()).length), 0)
                    if (rowCount === 0) return null
                    return (
                      <div className="mt-4 px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                        <p className="text-xs font-semibold text-white/40 mb-2">Preview — {rowCount} contact{rowCount !== 1 ? 's' : ''} will be created</p>
                        <div className="overflow-x-auto">
                          <table className="text-[11px] w-full">
                            <thead>
                              <tr className="border-b border-white/[0.05]">
                                {Object.keys(quickFields).map(f => <th key={f} className="pb-1.5 pr-4 text-left text-white/30 font-semibold uppercase tracking-wide">{f}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {Array.from({ length: Math.min(rowCount, 3) }, (_, i) => (
                                <tr key={i} className="border-b border-white/[0.03]">
                                  {Object.entries(quickFields).map(([f, v]) => {
                                    const parts = v.split(',').map(x => x.trim()).filter(Boolean)
                                    return <td key={f} className="py-1.5 pr-4 text-white/60 truncate max-w-[120px]">{parts[i] ?? parts[parts.length - 1] ?? '—'}</td>
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {rowCount > 3 && <p className="text-[10px] text-white/20 mt-1">+ {rowCount - 3} more</p>}
                        </div>
                        {emailVals.some(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) && (
                          <p className="text-[11px] text-red-400 mt-2">⚠ Some email addresses look invalid</p>
                        )}
                      </div>
                    )
                  })()}
                </div>

                <div className="flex justify-end gap-3">
                  <button onClick={onCancel} className="px-5 py-2.5 text-sm text-white/40 hover:text-white transition-colors">Cancel</button>
                  <button disabled={uploading || !quickFields.email?.trim()} onClick={handleQuickUpload}
                    className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-all">
                    {uploading ? 'Building…' : 'Next →'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 2: Compose */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-bold text-white mb-1">Compose email</h3>
              <p className="text-sm text-white/40">Use <code className="text-amber-400 bg-amber-500/10 px-1 rounded">{'{{column_name}}'}</code> to personalize with CSV data.</p>
            </div>

            {/* Transport selector */}
            <div>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">Transport</p>
              <div className="flex gap-2">
                {[
                  { id: 'email', label: 'Email', icon: '✉️', active: true },
                  { id: 'sms', label: 'SMS', icon: '💬', active: false },
                  { id: 'whatsapp', label: 'WhatsApp', icon: '🟢', active: false },
                ].map(t => (
                  <div key={t.id} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium ${t.id === transport ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' : 'bg-white/[0.02] border-white/[0.06] text-white/20 cursor-not-allowed'}`}>
                    <span>{t.icon}</span> {t.label}
                    {!t.active && <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-white/30 uppercase tracking-wide">soon</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Template picker */}
            {templates.filter(t => t.transport === 'email').length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-white/40 mb-2">Load from template (optional)</label>
                <select value={selectedTpl} onChange={e => setSelectedTpl(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all">
                  <option value="">— Write from scratch —</option>
                  {templates.filter(t => t.transport === 'email').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-white/40 mb-2">From name</label>
                <input value={fromName} onChange={e => setFromName(e.target.value)} maxLength={80}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all"
                  placeholder="RaxTeam" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/40 mb-2">Subject line *</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={200}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all"
                  placeholder="Hello {{name}}, check this out!" />
              </div>
            </div>

            {/* Variables hint */}
            {vars.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs text-white/25 self-center">Available vars:</span>
                {vars.map(v => (
                  <span key={v} className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded-md font-mono cursor-pointer hover:bg-amber-500/20 transition-all"
                    onClick={() => setHtmlBody(b => b + `{{${v}}}`)}>
                    {'{{' + v + '}}'}
                  </span>
                ))}
              </div>
            )}

            {/* Body editor with preview toggle */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-white/40">Email body (HTML) *</label>
                <button onClick={() => setPreviewMode(p => !p)} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
                  {previewMode ? '✎ Edit' : '👁 Preview'}
                </button>
              </div>
              {previewMode ? (
                <div className="bg-white rounded-xl p-5 min-h-[200px] border border-white/10" dangerouslySetInnerHTML={{ __html: htmlBody.replace(/\{\{(\w+)\}\}/g, (_, k) => upload?.preview[0]?.[k] ?? `[${k}]`) }} />
              ) : (
                <textarea value={htmlBody} onChange={e => setHtmlBody(e.target.value)} rows={10}
                  placeholder={'<h2>Hi {{name}},</h2>\n<p>We have something exciting for you at {{company}}...</p>\n<p>Best, RaxTeam</p>'}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white/80 placeholder-white/15 focus:outline-none focus:ring-2 focus:ring-amber-500/40 font-mono resize-none transition-all" />
              )}
            </div>

            <div className="flex justify-between gap-3">
              <button onClick={() => setStep(1)} className="px-5 py-2.5 text-sm text-white/40 hover:text-white transition-colors">← Back</button>
              <button disabled={!subject.trim() || !htmlBody.trim()} onClick={() => setStep(3)}
                className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-all">
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm + Send */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-bold text-white mb-1">Review & send</h3>
              <p className="text-sm text-white/40">Everything looks good? Give this campaign a name and hit send.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/40 mb-2">Campaign name *</label>
              <input value={campaignName} onChange={e => setCampaignName(e.target.value)} maxLength={120}
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all"
                placeholder="e.g. Q3 Product Launch" />
            </div>

            {/* Summary card */}
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl divide-y divide-white/[0.05]">
              {[
                ['Transport', `${TRANSPORT_ICONS[transport] ?? ''} Email`],
                ['Recipients', `${upload?.totalRows.toLocaleString()} contacts`],
                ['From', `${fromName} <noreply@raxteam.com>`],
                ['Subject', subject],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start gap-4 px-5 py-3">
                  <span className="text-xs font-semibold text-white/30 w-24 shrink-0 pt-0.5">{k}</span>
                  <span className="text-sm text-white/70 break-all">{v}</span>
                </div>
              ))}
            </div>

            {/* Preview of first email */}
            {upload?.preview[0] && (
              <div>
                <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-2">First email preview</p>
                <div className="bg-white rounded-xl p-5 max-h-48 overflow-y-auto text-sm"
                  dangerouslySetInnerHTML={{ __html: htmlBody.replace(/\{\{(\w+)\}\}/g, (_, k) => upload.preview[0]?.[k] ?? `[${k}]`) }} />
              </div>
            )}

            <div className="flex justify-between gap-3">
              <button onClick={() => setStep(2)} className="px-5 py-2.5 text-sm text-white/40 hover:text-white transition-colors">← Back</button>
              <button disabled={sending || !campaignName.trim()} onClick={send}
                className="px-8 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                {sending ? 'Sending…' : `🚀 Send to ${upload?.totalRows.toLocaleString()} contacts`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Starter template library ─────────────────────────────────────────────────

const HEADER = (title: string, sub: string) => `
<div style="background:linear-gradient(135deg,#312e81,#4c1d95,#1e1b4b);padding:40px 32px 32px;border-radius:12px 12px 0 0;text-align:center;">
  <div style="display:inline-block;width:44px;height:44px;background:rgba(255,255,255,0.1);border-radius:50%;line-height:44px;font-size:22px;margin-bottom:16px;">⚡</div>
  <h1 style="margin:0 0 8px;color:#fff;font-size:24px;font-weight:700;font-family:sans-serif;">${title}</h1>
  <p style="margin:0;color:rgba(255,255,255,0.65);font-size:14px;font-family:sans-serif;">${sub}</p>
</div>`

const FOOTER = `
<div style="background:#0a0b10;padding:24px 32px;border-top:1px solid rgba(255,255,255,0.06);border-radius:0 0 12px 12px;text-align:center;">
  <p style="margin:0 0 6px;color:rgba(255,255,255,0.3);font-size:12px;font-family:sans-serif;">RaxTeam · AI Skill Sharing Platform</p>
  <p style="margin:0;font-size:11px;font-family:sans-serif;"><a href="https://raxteam.com" style="color:#6366f1;text-decoration:none;">raxteam.com</a> &nbsp;·&nbsp; <a href="mailto:hello@raxteam.com" style="color:#6366f1;text-decoration:none;">hello@raxteam.com</a></p>
</div>`

const BODY_WRAP = (content: string) =>
  `<div style="background:#0f1117;padding:32px;font-family:sans-serif;">${content}</div>`

const CTA = (label: string, href = 'https://raxteam.com') =>
  `<div style="text-align:center;margin:28px 0 8px;"><a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6366f1);color:#fff;font-weight:700;font-size:14px;padding:14px 32px;border-radius:10px;text-decoration:none;">${label}</a></div>`

const P = (text: string, muted = false) =>
  `<p style="margin:0 0 16px;color:${muted ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.8)'};font-size:15px;line-height:1.7;">${text}</p>`

const CARD = (content: string) =>
  `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:20px 24px;margin:16px 0;">${content}</div>`

const H2 = (text: string) =>
  `<h2 style="margin:0 0 12px;color:#fff;font-size:18px;font-weight:700;">${text}</h2>`

type StarterTemplate = { name: string; subject: string; body: string }

const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    name: 'Welcome to RaxTeam',
    subject: 'Welcome to RaxTeam, {{name}}! 🚀',
    body: `<div style="max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;">
${HEADER('Welcome aboard, {{name}}!', 'Your AI skill workspace is ready')}
${BODY_WRAP(`
${P('Hi {{name}}, thanks for joining <strong style="color:#a5b4fc;">RaxTeam</strong>! You\'re now part of a platform where teams share, discover, and use AI prompts as structured skills — supercharged by MCP.')}
${CARD(`${H2('Get started in 3 steps')}
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">① Create your first skill from the <em>Skills</em> tab</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">② Invite teammates via <em>Members</em></p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">③ Connect via MCP from <em>Integration</em></p>`)}
${CTA('Open my workspace →')}
${P('Questions? Reply to this email anytime.', true)}
`)}
${FOOTER}</div>`,
  },
  {
    name: 'Skill Approved — Congrats',
    subject: '🎉 Your skill "{{skill_name}}" is now live!',
    body: `<div style="max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;">
${HEADER('Your skill is live! 🎉', 'It\'s now discoverable by the community')}
${BODY_WRAP(`
${P('Hi {{name}}, great news — your skill <strong style="color:#a5b4fc;">{{skill_name}}</strong> has been reviewed and approved by our team.')}
${CARD(`${H2('What happens next?')}
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">• It\'s now publicly discoverable in the marketplace</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">• Other teams can find and use it via MCP</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">• You\'ll earn upvotes as usage grows</p>`)}
${CTA('View your skill →')}
`)}
${FOOTER}</div>`,
  },
  {
    name: 'Upgrade to Pro',
    subject: '{{name}}, unlock the full power of RaxTeam ⚡',
    body: `<div style="max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;">
${HEADER('Time to go Pro', 'Unlock unlimited skills & advanced features')}
${BODY_WRAP(`
${P('Hi {{name}}, your team at <strong style="color:#a5b4fc;">{{org_name}}</strong> has been building great skills. Pro gives you everything you need to scale.')}
${CARD(`${H2('What you get on Pro')}
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">✓ Unlimited private skills</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">✓ File & image attachments on skills</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">✓ Priority skill review (&lt;24h)</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">✓ Eval test cases & CI checks</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">✓ Team analytics dashboard</p>`)}
${CTA('Upgrade now →', 'https://raxteam.com/upgrade')}
${P('Already on Pro? Ignore this — you\'re all set! 🎯', true)}
`)}
${FOOTER}</div>`,
  },
  {
    name: 'Weekly Platform Digest',
    subject: '📊 Your RaxTeam week in review — {{week}}',
    body: `<div style="max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;">
${HEADER('Weekly Digest', '{{week}}')}
${BODY_WRAP(`
${P('Hi {{name}}, here\'s what happened on RaxTeam this week.')}
${CARD(`${H2('Your team\'s activity')}
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">📦 Skills created: <strong style="color:#fff;">{{skills_created}}</strong></p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">🔍 Skills used: <strong style="color:#fff;">{{skills_used}}</strong></p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">👥 Active members: <strong style="color:#fff;">{{active_members}}</strong></p>`)}
${CARD(`${H2('Community highlights')}
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">🌟 {{top_skill}} was the most-used public skill this week</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">🆕 {{new_skills}} new public skills were approved</p>`)}
${CTA('View full dashboard →')}
`)}
${FOOTER}</div>`,
  },
  {
    name: 'Re-engagement — We Miss You',
    subject: '{{name}}, your team\'s skills are waiting 👀',
    body: `<div style="max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;">
${HEADER('It\'s been a while...', 'Your workspace is ready when you are')}
${BODY_WRAP(`
${P('Hi {{name}}, we noticed you haven\'t logged in for a bit. Your skills at <strong style="color:#a5b4fc;">{{org_name}}</strong> are still there, ready to power your team\'s AI workflows.')}
${CARD(`${H2('What\'s new since you left')}
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">🆕 MCP integration now supports Claude, Cursor & Windsurf</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">📊 New usage analytics on each skill</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">🌐 Public skill marketplace now has {{community_count}}+ approved skills</p>`)}
${CTA('Jump back in →')}
${P('If you\'d prefer not to receive these, just reply and let us know.', true)}
`)}
${FOOTER}</div>`,
  },
  {
    name: 'New Community Skills',
    subject: '🌟 {{count}} new skills just approved in the community',
    body: `<div style="max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;">
${HEADER('New skills in the marketplace', 'Freshly approved this week')}
${BODY_WRAP(`
${P('Hi {{name}}, <strong style="color:#a5b4fc;">{{count}} new skills</strong> were approved in the RaxTeam community this week. Here are the top picks from your domain:')}
${CARD(`<p style="margin:4px 0 12px;color:#a5b4fc;font-size:13px;font-weight:700;">⭐ {{skill_1}}</p>
<p style="margin:0 0 16px;color:rgba(255,255,255,0.5);font-size:13px;">{{skill_1_desc}}</p>
<p style="margin:4px 0 12px;color:#a5b4fc;font-size:13px;font-weight:700;">⭐ {{skill_2}}</p>
<p style="margin:0;color:rgba(255,255,255,0.5);font-size:13px;">{{skill_2_desc}}</p>`)}
${CTA('Explore all new skills →')}
`)}
${FOOTER}</div>`,
  },
  {
    name: 'Product Feature Announcement',
    subject: '🚀 New on RaxTeam: {{feature_name}}',
    body: `<div style="max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;">
${HEADER('We just shipped something new ✨', '{{feature_name}} is now live')}
${BODY_WRAP(`
${P('Hi {{name}}, the RaxTeam team has been heads-down building — and we\'re excited to announce <strong style="color:#a5b4fc;">{{feature_name}}</strong>.')}
${CARD(`${H2('What it does')}
${P('{{feature_description}}')}
${H2('Why it matters')}
${P('{{feature_benefit}}')}`)}
${CTA('Try it now →')}
${P('As always, reply with your feedback — we read everything.', true)}
`)}
${FOOTER}</div>`,
  },
  {
    name: 'Team Invite Reminder',
    subject: '⏰ Reminder: You\'ve been invited to {{org_name}} on RaxTeam',
    body: `<div style="max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;">
${HEADER('Your invitation is waiting', 'Join {{org_name}} on RaxTeam')}
${BODY_WRAP(`
${P('Hi {{name}}, this is a friendly reminder that <strong style="color:#a5b4fc;">{{inviter_name}}</strong> invited you to join <strong style="color:#a5b4fc;">{{org_name}}</strong> on RaxTeam — the AI skill sharing platform built for teams.')}
${CARD(`${H2('What is RaxTeam?')}
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">• Build and share AI prompt skills with your team</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">• Connect your AI tools via Model Context Protocol (MCP)</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">• Discover community-built skills in the marketplace</p>`)}
${CTA('Accept invitation →', 'https://raxteam.com/join?token={{invite_token}}')}
${P('This invite expires in {{days_left}} days.', true)}
`)}
${FOOTER}</div>`,
  },
  {
    name: 'Feedback Request',
    subject: '{{name}}, we\'d love your feedback 💬',
    body: `<div style="max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;">
${HEADER('How are we doing?', 'Your feedback shapes what we build next')}
${BODY_WRAP(`
${P('Hi {{name}}, you\'ve been using RaxTeam for a while now — we\'d love to hear what you think.')}
${CARD(`${H2('Two quick questions')}
<p style="margin:8px 0;color:rgba(255,255,255,0.6);font-size:13px;">① What\'s the one thing you wish RaxTeam did better?</p>
<p style="margin:8px 0;color:rgba(255,255,255,0.6);font-size:13px;">② What feature would make you recommend us to a colleague?</p>`)}
<div style="text-align:center;margin:24px 0 8px;">
  <a href="mailto:hello@raxteam.com?subject=Feedback from {{name}}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6366f1);color:#fff;font-weight:700;font-size:14px;padding:14px 32px;border-radius:10px;text-decoration:none;">Reply with feedback →</a>
</div>
${P('It takes under 2 minutes and directly influences our roadmap.', true)}
`)}
${FOOTER}</div>`,
  },
  {
    name: 'API & MCP Integration Guide',
    subject: '🔌 Connect {{org_name}} to your AI tools with MCP',
    body: `<div style="max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;">
${HEADER('Supercharge your AI tools', 'Connect RaxTeam skills via MCP')}
${BODY_WRAP(`
${P('Hi {{name}}, did you know your skills on RaxTeam can be accessed directly from Claude, Cursor, Windsurf and other MCP-compatible AI tools?')}
${CARD(`${H2('Quick setup (under 5 min)')}
<p style="margin:6px 0;color:rgba(255,255,255,0.6);font-size:13px;">① Go to <em>Integration</em> in your dashboard</p>
<p style="margin:6px 0;color:rgba(255,255,255,0.6);font-size:13px;">② Copy your MCP server config JSON</p>
<p style="margin:6px 0;color:rgba(255,255,255,0.6);font-size:13px;">③ Paste it into your AI tool\'s MCP config</p>
<p style="margin:6px 0;color:rgba(255,255,255,0.6);font-size:13px;">④ Your skills appear as tools instantly ⚡</p>`)}
${CTA('Open Integration tab →', 'https://raxteam.com/integration')}
${P('Supports Claude Desktop, Cursor, Windsurf, and any MCP-compatible client.', true)}
`)}
${FOOTER}</div>`,
  },
  {
    name: 'Trial Ending Soon',
    subject: '⚠️ Your Pro trial ends in {{days_left}} days',
    body: `<div style="max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;">
${HEADER('Your trial is almost up', '{{days_left}} days remaining on Pro')}
${BODY_WRAP(`
${P('Hi {{name}}, your Pro trial for <strong style="color:#a5b4fc;">{{org_name}}</strong> ends on <strong style="color:#fff;">{{expiry_date}}</strong>.')}
${CARD(`${H2('What happens after?')}
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">• You\'ll move to the Free plan</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">• Skills over the free limit will be archived (not deleted)</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">• File attachments will become view-only</p>`)}
${CTA('Keep Pro — upgrade now →', 'https://raxteam.com/upgrade')}
${P('Questions about pricing? Reply here — we\'re happy to chat.', true)}
`)}
${FOOTER}</div>`,
  },
  {
    name: 'CEO / CTO Outreach — RaxTeam',
    subject: '{{name}}, a smarter way for {{company}} to manage AI at scale',
    body: `<div style="max-width:620px;margin:0 auto;font-family:'Segoe UI',Arial,sans-serif;border-radius:16px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.4);">

<!-- Hero banner -->
<div style="background:linear-gradient(135deg,#0f0c29,#302b63,#24243e);padding:48px 40px 36px;text-align:center;position:relative;">
  <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.35);border-radius:100px;padding:6px 16px;margin-bottom:24px;">
    <span style="width:7px;height:7px;background:#6366f1;border-radius:50%;display:inline-block;"></span>
    <span style="color:#a5b4fc;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;">AI Skill Infrastructure</span>
  </div>
  <h1 style="margin:0 0 12px;color:#ffffff;font-size:28px;font-weight:800;line-height:1.25;letter-spacing:-0.5px;">
    Your AI prompts are<br/>
    <span style="background:linear-gradient(90deg,#a78bfa,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">scattered. Let's fix that.</span>
  </h1>
  <p style="margin:0;color:rgba(255,255,255,0.55);font-size:15px;line-height:1.6;">Hi {{name}} — I'll keep this short and worth your time.</p>
</div>

<!-- Body -->
<div style="background:#0f1117;padding:36px 40px;">

  <p style="margin:0 0 20px;color:rgba(255,255,255,0.8);font-size:15px;line-height:1.75;">
    Engineering and product teams at <strong style="color:#fff;">{{company}}</strong> are almost certainly writing AI prompts — in Notion docs, Slack threads, personal scripts, and scattered across repos. No versioning. No review process. No visibility into what's actually working.
  </p>

  <!-- Problem / Solution card -->
  <div style="background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.05));border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:24px 28px;margin:0 0 24px;">
    <h2 style="margin:0 0 16px;color:#fff;font-size:16px;font-weight:700;">What RaxTeam gives your team</h2>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:6px 0;vertical-align:top;width:24px;color:#6366f1;font-size:16px;">✦</td>
        <td style="padding:6px 0 6px 10px;color:rgba(255,255,255,0.7);font-size:13.5px;line-height:1.55;">
          <strong style="color:#fff;">Shared skill library</strong> — every AI prompt versioned, reviewed, and accessible across tools via MCP
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;vertical-align:top;color:#6366f1;font-size:16px;">✦</td>
        <td style="padding:6px 0 6px 10px;color:rgba(255,255,255,0.7);font-size:13.5px;line-height:1.55;">
          <strong style="color:#fff;">Zero prompt drift</strong> — approval workflows and eval test suites catch regressions before they reach production
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;vertical-align:top;color:#6366f1;font-size:16px;">✦</td>
        <td style="padding:6px 0 6px 10px;color:rgba(255,255,255,0.7);font-size:13.5px;line-height:1.55;">
          <strong style="color:#fff;">Works with your stack</strong> — native MCP support for Claude, Cursor, Windsurf and any AI client your team already uses
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;vertical-align:top;color:#6366f1;font-size:16px;">✦</td>
        <td style="padding:6px 0 6px 10px;color:rgba(255,255,255,0.7);font-size:13.5px;line-height:1.55;">
          <strong style="color:#fff;">Full observability</strong> — see which prompts are used, how often, and what they're saving in tokens and time
        </td>
      </tr>
    </table>
  </div>

  <!-- Social proof / site preview strip -->
  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:16px 20px;margin:0 0 28px;display:flex;align-items:center;gap:16px;">
    <div style="flex:1;">
      <p style="margin:0 0 4px;color:rgba(255,255,255,0.35);font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Live at</p>
      <p style="margin:0;color:#a5b4fc;font-size:14px;font-weight:700;">raxteam.com</p>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.3);font-size:12px;">AI skill sharing · MCP-native · Version-controlled</p>
    </div>
    <a href="https://raxteam.com" style="display:inline-block;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;font-size:12px;font-weight:600;padding:8px 16px;border-radius:8px;text-decoration:none;white-space:nowrap;">Visit site →</a>
  </div>

  <p style="margin:0 0 28px;color:rgba(255,255,255,0.65);font-size:14px;line-height:1.75;">
    I'd love to show you how teams in <strong style="color:#fff;">{{industry}}</strong> are using RaxTeam to standardise their AI workflows. A 20-minute call is all it takes — no deck, just a live demo tailored to {{company}}.
  </p>

  <!-- CTA -->
  <div style="text-align:center;margin:0 0 32px;">
    <a href="https://raxteam.com" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:800;font-size:15px;padding:16px 40px;border-radius:12px;text-decoration:none;letter-spacing:0.2px;box-shadow:0 8px 32px rgba(99,102,241,0.4);">
      Book a 20-min demo →
    </a>
    <p style="margin:12px 0 0;color:rgba(255,255,255,0.25);font-size:12px;">Or just reply to this email — I personally read every response.</p>
  </div>

  <p style="margin:0;color:rgba(255,255,255,0.3);font-size:12px;line-height:1.7;border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;">
    Best,<br/>
    <strong style="color:rgba(255,255,255,0.5);">Founder, RaxTeam</strong><br/>
    <a href="https://raxteam.com" style="color:#6366f1;text-decoration:none;">raxteam.com</a> &nbsp;·&nbsp; <a href="mailto:hello@raxteam.com" style="color:#6366f1;text-decoration:none;">hello@raxteam.com</a>
  </p>
</div>

<!-- Footer -->
<div style="background:#080a0f;padding:20px 40px;border-top:1px solid rgba(255,255,255,0.05);text-align:center;">
  <p style="margin:0;color:rgba(255,255,255,0.2);font-size:11px;">RaxTeam · AI Skill Sharing Platform · You're receiving this because of your role at {{company}}.</p>
</div>

</div>`,
  },
  {
    name: 'Partnership / B2B Outreach',
    subject: 'AI skill infrastructure for {{company}} — RaxTeam',
    body: `<div style="max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;">
${HEADER('Built for teams like {{company}}', 'AI skills, shared and version-controlled')}
${BODY_WRAP(`
${P('Hi {{name}}, I\'m reaching out because teams in {{industry}} are increasingly building custom AI workflows — and managing those prompts at scale is genuinely hard.')}
${P('RaxTeam is a platform where your team can build, review, version, and share AI prompt skills — and expose them as tools to any MCP-compatible AI client.')}
${CARD(`${H2('Why teams choose RaxTeam')}
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">🔒 Private workspace — your prompts stay yours</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">🔄 Version control + approval workflow</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">🔌 MCP-native — works with Claude, Cursor, Windsurf</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">📊 Usage analytics per skill</p>`)}
${CTA('Try RaxTeam free →', 'https://raxteam.com')}
${P('Happy to set up a 20-min demo if it\'s relevant. Just reply!', true)}
`)}
${FOOTER}</div>`,
  },
  {
    name: 'Thank You — Post Upgrade',
    subject: '🙏 Thank you for upgrading, {{name}}!',
    body: `<div style="max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;">
${HEADER('You\'re now on Pro! 🎉', 'Welcome to the full RaxTeam experience')}
${BODY_WRAP(`
${P('Hi {{name}}, thank you so much for upgrading <strong style="color:#a5b4fc;">{{org_name}}</strong> to Pro. It means the world to a small team like ours.')}
${CARD(`${H2('Your Pro features are now active')}
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">✓ Unlimited private skills</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">✓ File attachments & RAG on skills</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">✓ Priority review queue</p>
<p style="margin:4px 0;color:rgba(255,255,255,0.6);font-size:13px;">✓ Eval test cases & CI</p>`)}
${P('If there\'s anything you\'d like help with, reply here — I personally read all emails from Pro users.', true)}
${CTA('Explore Pro features →')}
`)}
${FOOTER}</div>`,
  },
]

// ── Templates List ────────────────────────────────────────────────────────────

function TemplatesList() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<Template> | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [seeding, setSeeding] = useState(false)
  const [showStarters, setShowStarters] = useState(false)

  useEffect(() => {
    saJSON<{ templates: Template[] }>('/templates')
      .then(d => setTemplates(d.templates ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    if (!editing) return
    setSaving(true); setError('')
    try {
      if (editing.id) {
        const data = await saJSON<{ template: Template }>(`/templates/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) })
        setTemplates(t => t.map(x => x.id === data.template.id ? data.template : x))
      } else {
        const data = await saJSON<{ template: Template }>('/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transport: 'email', ...editing }) })
        setTemplates(t => [data.template, ...t])
      }
      setEditing(null)
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  async function del(id: string) {
    if (!confirm('Delete this template?')) return
    await saFetch(`/templates/${id}`, { method: 'DELETE' })
    setTemplates(t => t.filter(x => x.id !== id))
  }

  async function seedAll() {
    setSeeding(true); setError('')
    try {
      const created: Template[] = []
      for (const s of STARTER_TEMPLATES) {
        const data = await saJSON<{ template: Template }>('/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transport: 'email', ...s }),
        })
        created.push(data.template)
      }
      setTemplates(t => [...created, ...t])
      setShowStarters(false)
    } catch (e) { setError((e as Error).message) }
    finally { setSeeding(false) }
  }

  async function useStarter(s: StarterTemplate) {
    setSeeding(true); setError('')
    try {
      const data = await saJSON<{ template: Template }>('/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transport: 'email', ...s }),
      })
      setTemplates(t => [data.template, ...t])
    } catch (e) { setError((e as Error).message) }
    finally { setSeeding(false) }
  }

  const TRANSPORT_OPTIONS = [
    { id: 'email', label: 'Email', icon: '✉️' },
    { id: 'sms', label: 'SMS (coming soon)', icon: '💬', disabled: true },
    { id: 'whatsapp', label: 'WhatsApp (coming soon)', icon: '🟢', disabled: true },
  ]

  if (editing !== null) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-white">{editing.id ? 'Edit template' : 'New template'}</h3>
        <button onClick={() => setEditing(null)} className="text-white/30 hover:text-white transition-colors text-xl">×</button>
      </div>
      {error && <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-white/40 mb-2">Template name *</label>
          <input value={editing.name ?? ''} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} maxLength={120}
            className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all"
            placeholder="e.g. Welcome email" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-white/40 mb-2">Transport *</label>
          <select value={editing.transport ?? 'email'} onChange={e => setEditing(p => ({ ...p, transport: e.target.value }))}
            className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all">
            {TRANSPORT_OPTIONS.map(o => <option key={o.id} value={o.id} disabled={o.disabled}>{o.icon} {o.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-white/40 mb-2">Subject line</label>
        <input value={editing.subject ?? ''} onChange={e => setEditing(p => ({ ...p, subject: e.target.value }))} maxLength={200}
          className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all"
          placeholder="Hello {{name}}!" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-white/40 mb-2">Body (HTML) *</label>
        <textarea value={editing.body ?? ''} onChange={e => setEditing(p => ({ ...p, body: e.target.value }))} rows={10}
          placeholder={'<h2>Hi {{name}},</h2>\n<p>...</p>'}
          className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white/80 placeholder-white/15 focus:outline-none focus:ring-2 focus:ring-amber-500/40 font-mono resize-none transition-all" />
        <p className="text-xs text-white/25 mt-1">Use {'{{column_name}}'} for personalization</p>
      </div>

      <div className="flex justify-end gap-3">
        <button onClick={() => setEditing(null)} className="px-5 py-2.5 text-sm text-white/40 hover:text-white transition-colors">Cancel</button>
        <button disabled={saving || !editing.name?.trim() || !editing.body?.trim()} onClick={save}
          className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-all">
          {saving ? 'Saving…' : 'Save template'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white">Templates</h3>
          <p className="text-xs text-slate-500 mt-0.5">{templates.length} saved · Reusable with {'{{variable}}'} placeholders</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowStarters(s => !s)}
            className={`px-4 py-2.5 border rounded-xl text-sm font-semibold transition-all ${showStarters ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300' : 'bg-white/[0.04] border-white/10 text-white/50 hover:text-white'}`}>
            ✦ Starter library
          </button>
          <button onClick={() => setEditing({ transport: 'email' })}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 rounded-xl text-sm font-semibold text-white transition-all">
            + New
          </button>
        </div>
      </div>

      {/* Starter template gallery */}
      {showStarters && (
        <div className="bg-white/[0.02] border border-indigo-500/20 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-sm font-bold text-white">Starter Template Library</h4>
              <p className="text-xs text-white/35 mt-0.5">{STARTER_TEMPLATES.length} branded templates — add all at once or pick individually</p>
            </div>
            <button onClick={seedAll} disabled={seeding}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all">
              {seeding ? 'Adding…' : `⬇ Add all ${STARTER_TEMPLATES.length}`}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {STARTER_TEMPLATES.map((s, i) => (
              <div key={i} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 hover:border-indigo-500/30 transition-all group">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h5 className="text-xs font-bold text-white leading-tight">{s.name}</h5>
                  <button onClick={() => useStarter(s)} disabled={seeding}
                    className="shrink-0 px-2.5 py-1 bg-indigo-500/15 border border-indigo-500/25 hover:bg-indigo-500/25 text-indigo-300 rounded-lg text-[10px] font-bold transition-all opacity-0 group-hover:opacity-100">
                    + Add
                  </button>
                </div>
                <p className="text-[10px] text-white/35 leading-relaxed line-clamp-2">{s.subject}</p>
                {/* Variable chips extracted from subject */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {[...new Set([...s.subject.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))].slice(0, 4).map(v => (
                    <span key={v} className="text-[9px] bg-amber-500/10 text-amber-400/60 px-1.5 py-0.5 rounded font-mono">{'{{'+v+'}}'}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">{error}</div>}

      {loading && <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-20 bg-white/[0.02] rounded-xl animate-pulse" />)}</div>}

      {!loading && templates.length === 0 && !showStarters && (
        <div className="text-center py-12 bg-white/[0.02] border border-white/[0.05] rounded-2xl">
          <div className="text-3xl mb-3">📝</div>
          <p className="text-white/50 text-sm font-medium">No templates yet</p>
          <p className="text-white/25 text-xs mt-1">Use the starter library above or create your own</p>
          <button onClick={() => setShowStarters(true)} className="mt-4 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold text-white transition-all">
            Browse starter library →
          </button>
        </div>
      )}

      {templates.map(t => (
        <div key={t.id} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5 hover:border-white/[0.12] transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span>{TRANSPORT_ICONS[t.transport] ?? '📨'}</span>
                <h4 className="text-sm font-bold text-white">{t.name}</h4>
                <span className="text-[10px] bg-white/[0.06] text-white/30 px-2 py-0.5 rounded uppercase tracking-wide">{t.transport}</span>
              </div>
              {t.subject && <p className="text-xs text-white/40 mb-2">{t.subject}</p>}
              {t.variables.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {t.variables.map(v => <span key={v} className="text-[10px] bg-amber-500/10 text-amber-400/70 px-1.5 py-0.5 rounded font-mono">{'{{' + v + '}}'}</span>)}
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setEditing(t)} className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-white/50 hover:text-white rounded-lg text-xs font-medium transition-all">Edit</button>
              <button onClick={() => del(t.id)} className="px-3 py-1.5 bg-red-500/8 hover:bg-red-500/15 border border-red-500/15 text-red-400 rounded-lg text-xs font-medium transition-all">Delete</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
