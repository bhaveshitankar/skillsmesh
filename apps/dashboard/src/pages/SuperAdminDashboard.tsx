import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { saRequest, clearSAToken, getSAToken, SA_API, SA_PATH } from '../lib/superadmin'
import CampaignsTab from '../components/CampaignsTab'
import PaymentsTab from '../components/PaymentsTab'

// ── Types ────────────────────────────────────────────────────────────────────

type Stats = {
  orgs: { total: number; pro: number; free: number }
  users: { total: number }
  skills: { total: number; pending: number; publicApproved: number }
}

type Org = {
  id: string; name: string; slug: string; plan: string
  memberCount: number; skillCount: number; createdAt: number
  settings: { approvalThreshold: number; embeddingDim: number }
}

type OrgDetail = Org & {
  members: { id: string; name: string; email: string; role: string; lastActiveAt: number }[]
  skills: Skill[]
}

type Skill = {
  id: string; name: string; description: string; status: string
  visibility: string; createdAt: number; orgId: string
  upvotes: number; useCount: number
  org: { name: string; slug: string; plan: string } | null
}

type Tab = 'overview' | 'community' | 'skills' | 'orgs' | 'campaigns' | 'payments' | 'monitoring'

// ── Small components ─────────────────────────────────────────────────────────

function Badge({ value }: { value: string }) {
  const map: Record<string, string> = {
    approved:   'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    pending:    'bg-amber-500/15 text-amber-300 border-amber-500/25',
    draft:      'bg-slate-500/15 text-slate-400 border-slate-500/25',
    deprecated: 'bg-red-500/15 text-red-400 border-red-500/25',
    public:     'bg-blue-500/15 text-blue-300 border-blue-500/25',
    private:    'bg-slate-500/15 text-slate-400 border-slate-500/25',
    shared:     'bg-violet-500/15 text-violet-300 border-violet-500/25',
    pro:        'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    free:       'bg-slate-500/15 text-slate-400 border-slate-500/25',
    enterprise: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
    admin:      'bg-red-500/15 text-red-300 border-red-500/25',
    curator:    'bg-violet-500/15 text-violet-300 border-violet-500/25',
    member:     'bg-slate-500/15 text-slate-400 border-slate-500/25',
  }
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wide ${map[value] ?? map.free}`}>
      {value}
    </span>
  )
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white/[0.04] border border-white/[0.07] rounded-xl p-5">
      <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-2">{label}</p>
      <p className="text-3xl font-bold text-white tabular-nums">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
    </div>
  )
}

function Skeleton() {
  return <div className="h-16 bg-white/[0.02] rounded-xl animate-pulse" />
}

function BulkBar({
  count, onApprove, onReject, onDelete, onMakePublic, onMakePrivate, onClear,
}: {
  count: number
  onApprove?: () => void
  onReject: () => void
  onDelete: () => void
  onMakePublic?: () => void
  onMakePrivate?: () => void
  onClear: () => void
}) {
  if (count === 0) return null
  return (
    <div className="flex items-center gap-2 mb-4 px-4 py-3 bg-amber-500/5 border border-amber-500/15 rounded-xl flex-wrap">
      <span className="text-sm text-amber-300 font-medium">{count} selected</span>
      {onApprove && (
        <button onClick={onApprove} className="px-3 py-1.5 text-xs bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-300 rounded-lg transition-colors">
          Approve all
        </button>
      )}
      <button onClick={onReject} className="px-3 py-1.5 text-xs bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 rounded-lg transition-colors">
        Reject all
      </button>
      {onMakePublic && (
        <button onClick={onMakePublic} className="px-3 py-1.5 text-xs bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-300 rounded-lg transition-colors">
          Make public
        </button>
      )}
      {onMakePrivate && (
        <button onClick={onMakePrivate} className="px-3 py-1.5 text-xs bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/20 text-slate-400 rounded-lg transition-colors">
          Make private
        </button>
      )}
      <button onClick={onDelete} className="px-3 py-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 rounded-lg transition-colors ml-auto">
        Delete all
      </button>
      <button onClick={onClear} className="text-xs text-slate-600 hover:text-slate-400">✕</button>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')
  const [error, setError] = useState('')
  const [flashMsg, setFlashMsg] = useState('')
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [stats, setStats] = useState<Stats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  // Skills (all)
  const [skills, setSkills] = useState<Skill[]>([])
  const [skillTotal, setSkillTotal] = useState(0)
  const [skillPage, setSkillPage] = useState(1)
  const [skillStatus, setSkillStatus] = useState('pending')
  const [skillVisibility, setSkillVisibility] = useState('')
  const [skillOrgFilter, setSkillOrgFilter] = useState('')
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set())
  const [skillsLoading, setSkillsLoading] = useState(false)

  // Community (public)
  const [community, setCommunity] = useState<Skill[]>([])
  const [communityTotal, setCommunityTotal] = useState(0)
  const [communityPage, setCommunityPage] = useState(1)
  const [communityStatus, setCommunityStatus] = useState('approved')
  const [selectedCommunity, setSelectedCommunity] = useState<Set<string>>(new Set())
  const [communityLoading, setCommunityLoading] = useState(false)

  // Orgs
  const [orgs, setOrgs] = useState<Org[]>([])
  const [orgTotal, setOrgTotal] = useState(0)
  const [orgPage, setOrgPage] = useState(1)
  const [orgsLoading, setOrgsLoading] = useState(false)
  const [activeOrg, setActiveOrg] = useState<OrgDetail | null>(null)
  const [orgDetailLoading, setOrgDetailLoading] = useState(false)
  const [editingOrg, setEditingOrg] = useState<{ plan: string; threshold: number } | null>(null)

  // Search
  const [skillSearch, setSkillSearch] = useState('')
  const [communitySearch, setCommunitySearch] = useState('')
  const [orgSearch, setOrgSearch] = useState('')
  const [orgPlanFilter, setOrgPlanFilter] = useState('')
  const skillSearchDebounced = useDebounce(skillSearch, 350)
  const communitySearchDebounced = useDebounce(communitySearch, 350)
  const orgSearchDebounced = useDebounce(orgSearch, 350)

  // ── Helpers ──────────────────────────────────────────────────────────────

  function flash(msg: string) {
    setFlashMsg(msg)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlashMsg(''), 3000)
  }

  const logout = useCallback(async () => {
    try {
      await fetch(`${SA_API}/logout`, { method: 'POST', headers: { Authorization: `Bearer ${getSAToken()}` } })
    } catch {}
    clearSAToken()
    navigate(SA_PATH, { replace: true })
  }, [navigate])

  // ── Data loading ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!getSAToken()) { navigate(SA_PATH, { replace: true }); return }
    setStatsLoading(true)
    setError('')
    saRequest<Stats>('/stats')
      .then(setStats)
      .catch(err => setError(String(err)))
      .finally(() => setStatsLoading(false))
  }, [navigate])

  useEffect(() => {
    if (tab !== 'skills') return
    setSkillsLoading(true)
    setSelectedSkills(new Set())
    const params = new URLSearchParams({ page: String(skillPage) })
    if (skillStatus) params.set('status', skillStatus)
    if (skillVisibility) params.set('visibility', skillVisibility)
    if (skillOrgFilter) params.set('orgId', skillOrgFilter)
    if (skillSearchDebounced) params.set('search', skillSearchDebounced)
    saRequest<{ skills: Skill[]; total: number }>(`/skills?${params}`)
      .then(d => { setSkills(d.skills); setSkillTotal(d.total) })
      .catch(err => setError(String(err)))
      .finally(() => setSkillsLoading(false))
  }, [tab, skillPage, skillStatus, skillVisibility, skillOrgFilter, skillSearchDebounced])

  useEffect(() => {
    if (tab !== 'community') return
    setCommunityLoading(true)
    setSelectedCommunity(new Set())
    const params = new URLSearchParams({ page: String(communityPage), visibility: 'public' })
    if (communityStatus) params.set('status', communityStatus)
    if (communitySearchDebounced) params.set('search', communitySearchDebounced)
    saRequest<{ skills: Skill[]; total: number }>(`/skills?${params}`)
      .then(d => { setCommunity(d.skills); setCommunityTotal(d.total) })
      .catch(err => setError(String(err)))
      .finally(() => setCommunityLoading(false))
  }, [tab, communityPage, communityStatus, communitySearchDebounced])

  useEffect(() => {
    if (tab !== 'orgs') return
    setOrgsLoading(true)
    const params = new URLSearchParams({ page: String(orgPage) })
    if (orgSearchDebounced) params.set('search', orgSearchDebounced)
    if (orgPlanFilter) params.set('plan', orgPlanFilter)
    saRequest<{ orgs: Org[]; total: number }>(`/orgs?${params}`)
      .then(d => { setOrgs(d.orgs); setOrgTotal(d.total) })
      .catch(err => setError(String(err)))
      .finally(() => setOrgsLoading(false))
  }, [tab, orgPage, orgSearchDebounced, orgPlanFilter])

  // ── Actions ──────────────────────────────────────────────────────────────

  async function bulkSkill(ids: string[], action: string, extra?: Record<string, string>) {
    if (ids.length === 0) return
    try {
      await saRequest('/skills/bulk', { method: 'POST', body: JSON.stringify({ ids, action, ...extra }) })
      const idSet = new Set(ids)
      const update = (s: Skill) => {
        if (!idSet.has(s.id)) return s
        if (action === 'approve') return { ...s, status: 'approved' }
        if (action === 'reject') return { ...s, status: 'draft' }
        if (action === 'set_visibility') return { ...s, visibility: extra?.visibility ?? s.visibility }
        return s
      }
      if (action === 'delete') {
        setSkills(s => s.filter(x => !idSet.has(x.id)))
        setCommunity(s => s.filter(x => !idSet.has(x.id)))
      } else {
        setSkills(s => s.map(update))
        setCommunity(s => s.map(update))
      }
      setSelectedSkills(new Set())
      setSelectedCommunity(new Set())
      flash(`${ids.length} skill${ids.length > 1 ? 's' : ''} updated`)
    } catch (err) {
      setError(String(err))
    }
  }

  async function singleApprove(id: string) {
    await saRequest(`/skills/${id}/approve`, { method: 'POST' })
    const update = (s: Skill) => s.id === id ? { ...s, status: 'approved' } : s
    setSkills(s => s.map(update))
    setCommunity(s => s.map(update))
    flash('Approved')
  }

  async function singleReject(id: string) {
    await saRequest(`/skills/${id}/reject`, { method: 'POST', body: JSON.stringify({}) })
    const update = (s: Skill) => s.id === id ? { ...s, status: 'draft' } : s
    setSkills(s => s.map(update))
    setCommunity(s => s.map(update))
    flash('Rejected')
  }

  async function singleDelete(id: string) {
    if (!confirm('Permanently delete this skill?')) return
    await saRequest(`/skills/${id}`, { method: 'DELETE' })
    setSkills(s => s.filter(x => x.id !== id))
    setCommunity(s => s.filter(x => x.id !== id))
    flash('Deleted')
  }

  async function openOrg(orgId: string) {
    setOrgDetailLoading(true)
    try {
      const resp = await saRequest<{ org: Org; members: OrgDetail['members']; skills: Skill[] }>(`/orgs/${orgId}`)
      const detail: OrgDetail = { ...resp.org, members: resp.members, skills: resp.skills }
      setActiveOrg(detail)
      setEditingOrg({ plan: detail.plan, threshold: detail.settings.approvalThreshold })
    } catch (err) {
      setError(String(err))
    } finally {
      setOrgDetailLoading(false)
    }
  }

  async function saveOrgEdits() {
    if (!activeOrg || !editingOrg) return
    try {
      await saRequest(`/orgs/${activeOrg.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ plan: editingOrg.plan, approvalThreshold: editingOrg.threshold }),
      })
      setOrgs(o => o.map(x => x.id === activeOrg.id ? { ...x, plan: editingOrg.plan } : x))
      setActiveOrg(a => a ? { ...a, plan: editingOrg.plan, settings: { ...a.settings, approvalThreshold: editingOrg.threshold } } : a)
      flash('Org updated')
    } catch (err) {
      setError(String(err))
    }
  }

  function filterByOrg(orgId: string) {
    setSkillOrgFilter(orgId)
    setSkillPage(1)
    setTab('skills')
    setActiveOrg(null)
  }

  function toggleSkill(id: string, set: Set<string>, setter: (s: Set<string>) => void) {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setter(next)
  }

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'community', label: 'Community', badge: stats?.skills.publicApproved },
    { id: 'skills', label: 'All Skills', badge: stats?.skills.pending },
    { id: 'orgs', label: 'Organizations', badge: stats?.orgs.total },
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'payments', label: 'Payments' },
    { id: 'monitoring', label: 'Monitoring' },
  ]

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#030508] text-white flex flex-col">

      {/* Top bar */}
      <div className="border-b border-white/[0.06] px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-mono text-slate-400 tracking-widest uppercase">Superadmin Console</span>
        </div>
        <button onClick={logout} className="text-xs text-slate-600 hover:text-red-400 transition-colors font-mono">
          Sign out
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm flex items-center justify-between">
          <span>⚠ {error}</span>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-300 ml-4">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-white/[0.06] flex gap-0 shrink-0 overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`shrink-0 px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap ${
              tab === t.id ? 'border-amber-400 text-amber-300' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}>
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${tab === t.id ? 'bg-amber-500/20 text-amber-300' : 'bg-white/[0.06] text-slate-500'}`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 max-w-6xl mx-auto w-full">

        {/* ── Overview ──────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div>
            {statsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => <Skeleton key={i} />)}
              </div>
            ) : stats ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                  <StatCard label="Orgs" value={stats.orgs.total} sub={`${stats.orgs.pro} pro · ${stats.orgs.free} free`} />
                  <StatCard label="Users" value={stats.users.total} />
                  <StatCard label="Skills" value={stats.skills.total} />
                  <StatCard label="Pending Review" value={stats.skills.pending} sub="Awaiting approval" />
                  <StatCard label="Public Approved" value={stats.skills.publicApproved} sub="In marketplace" />
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:flex-wrap">
                  <button onClick={() => { setSkillStatus('pending'); setTab('skills') }}
                    className="px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg text-sm font-medium hover:bg-amber-500/20 transition-colors text-left">
                    Review {stats.skills.pending} pending skills →
                  </button>
                  <button onClick={() => setTab('community')}
                    className="px-4 py-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded-lg text-sm font-medium hover:bg-blue-500/20 transition-colors text-left">
                    Browse community marketplace →
                  </button>
                  <button onClick={() => setTab('orgs')}
                    className="px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] text-slate-300 rounded-lg text-sm font-medium hover:bg-white/[0.07] transition-colors text-left">
                    Manage {stats.orgs.total} orgs →
                  </button>
                </div>
              </>
            ) : (
              <p className="text-slate-600 text-sm">No data yet.</p>
            )}
          </div>
        )}

        {/* ── Community ─────────────────────────────────────────────────── */}
        {tab === 'community' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-white font-semibold">Public Skill Marketplace</h2>
              <span className="text-xs text-slate-600">{communityTotal} skills</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-xs">🔍</span>
                <input
                  value={communitySearch}
                  onChange={e => { setCommunitySearch(e.target.value); setCommunityPage(1) }}
                  placeholder="Search skills…"
                  className="pl-8 pr-3 py-1.5 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/40 w-full sm:w-44 transition-all"
                />
              </div>
              <div className="flex gap-1 flex-wrap">
              {['approved', 'pending', 'draft', ''].map(s => (
                <button key={s} onClick={() => { setCommunityStatus(s); setCommunityPage(1) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${communityStatus === s ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}>
                  {s || 'all'}
                </button>
              ))}
              </div>
            </div>

            <BulkBar
              count={selectedCommunity.size}
              onApprove={() => bulkSkill([...selectedCommunity], 'approve')}
              onReject={() => bulkSkill([...selectedCommunity], 'reject')}
              onDelete={() => { if (confirm(`Delete ${selectedCommunity.size} skills?`)) bulkSkill([...selectedCommunity], 'delete') }}
              onMakePublic={() => bulkSkill([...selectedCommunity], 'set_visibility', { visibility: 'public' })}
              onMakePrivate={() => bulkSkill([...selectedCommunity], 'set_visibility', { visibility: 'private' })}
              onClear={() => setSelectedCommunity(new Set())}
            />

            {communityLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[...Array(6)].map((_, i) => <div key={i} className="h-28 bg-white/[0.02] rounded-xl animate-pulse" />)}
              </div>
            ) : community.length === 0 ? (
              <div className="text-center py-16 text-slate-600 text-sm">No public skills match this filter.</div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-2 px-2">
                  <input type="checkbox"
                    checked={selectedCommunity.size === community.length && community.length > 0}
                    onChange={() => setSelectedCommunity(prev => prev.size === community.length ? new Set() : new Set(community.map(s => s.id)))}
                    className="w-4 h-4 accent-amber-400 cursor-pointer" />
                  <span className="text-xs text-slate-600">Select all on this page</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {community.map(skill => (
                    <div key={skill.id} className={`bg-white/[0.03] border rounded-xl p-4 transition-colors ${selectedCommunity.has(skill.id) ? 'border-amber-500/30 bg-amber-500/[0.03]' : 'border-white/[0.07]'}`}>
                      <div className="flex items-start gap-3">
                        <input type="checkbox" checked={selectedCommunity.has(skill.id)}
                          onChange={() => toggleSkill(skill.id, selectedCommunity, setSelectedCommunity)}
                          className="mt-0.5 w-4 h-4 accent-amber-400 cursor-pointer shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-white text-sm truncate">{skill.name}</span>
                            <Badge value={skill.status} />
                          </div>
                          <p className="text-xs text-slate-400 line-clamp-2 mb-2">{skill.description}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex gap-3 text-[11px] text-slate-600">
                              <span>↑ {skill.upvotes ?? 0}</span>
                              <span>{skill.useCount ?? 0} uses</span>
                              <button onClick={() => filterByOrg(skill.orgId)} className="hover:text-slate-400 underline underline-offset-2 transition-colors">
                                {skill.org?.name ?? skill.orgId.slice(0, 8)}
                              </button>
                            </div>
                            <div className="flex gap-1">
                              {skill.status !== 'approved' && (
                                <button onClick={() => singleApprove(skill.id)} className="px-2 py-1 text-[10px] bg-emerald-500/15 border border-emerald-500/20 text-emerald-300 rounded hover:bg-emerald-500/25 transition-colors">✓</button>
                              )}
                              <button onClick={() => singleReject(skill.id)} className="px-2 py-1 text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded hover:bg-amber-500/20 transition-colors">↩</button>
                              <button onClick={() => singleDelete(skill.id)} className="px-2 py-1 text-[10px] bg-red-500/10 border border-red-500/20 text-red-400 rounded hover:bg-red-500/20 transition-colors">✕</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {communityTotal > 50 && (
                  <div className="flex items-center justify-center gap-2 mt-6">
                    <button disabled={communityPage === 1} onClick={() => setCommunityPage(p => p - 1)} className="px-3 py-1.5 text-xs bg-white/[0.04] border border-white/[0.07] rounded-lg disabled:opacity-30 hover:bg-white/[0.07]">← Prev</button>
                    <span className="text-xs text-slate-500">Page {communityPage} of {Math.ceil(communityTotal / 50)}</span>
                    <button disabled={communityPage * 50 >= communityTotal} onClick={() => setCommunityPage(p => p + 1)} className="px-3 py-1.5 text-xs bg-white/[0.04] border border-white/[0.07] rounded-lg disabled:opacity-30 hover:bg-white/[0.07]">Next →</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── All Skills ────────────────────────────────────────────────── */}
        {tab === 'skills' && (
          <div>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {/* Search */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-xs">🔍</span>
                <input
                  value={skillSearch}
                  onChange={e => { setSkillSearch(e.target.value); setSkillPage(1) }}
                  placeholder="Search skills…"
                  className="pl-8 pr-3 py-1.5 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/40 w-full sm:w-44 transition-all"
                />
              </div>
              <div className="flex gap-1 flex-wrap">
                {['', 'pending', 'approved', 'draft', 'deprecated'].map(s => (
                  <button key={s} onClick={() => { setSkillStatus(s); setSkillPage(1) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${skillStatus === s ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}>
                    {s || 'all'}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {['', 'public', 'private', 'shared'].map(v => (
                  <button key={v} onClick={() => { setSkillVisibility(v); setSkillPage(1) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${skillVisibility === v ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}>
                    {v || 'any'}
                  </button>
                ))}
              </div>
              {skillOrgFilter && (
                <button onClick={() => { setSkillOrgFilter(''); setSkillPage(1) }} className="px-2 py-1 text-xs bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg">
                  × clear org filter
                </button>
              )}
              <span className="ml-auto text-xs text-slate-600">{skillTotal} skills</span>
            </div>

            <BulkBar
              count={selectedSkills.size}
              onApprove={() => bulkSkill([...selectedSkills], 'approve')}
              onReject={() => bulkSkill([...selectedSkills], 'reject')}
              onDelete={() => { if (confirm(`Delete ${selectedSkills.size} skills?`)) bulkSkill([...selectedSkills], 'delete') }}
              onMakePublic={() => bulkSkill([...selectedSkills], 'set_visibility', { visibility: 'public' })}
              onMakePrivate={() => bulkSkill([...selectedSkills], 'set_visibility', { visibility: 'private' })}
              onClear={() => setSelectedSkills(new Set())}
            />

            {skillsLoading ? (
              <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} />)}</div>
            ) : skills.length === 0 ? (
              <div className="text-center py-16 text-slate-600 text-sm">No skills match this filter.</div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-2 px-2">
                  <input type="checkbox"
                    checked={selectedSkills.size === skills.length && skills.length > 0}
                    onChange={() => setSelectedSkills(prev => prev.size === skills.length ? new Set() : new Set(skills.map(s => s.id)))}
                    className="w-4 h-4 accent-amber-400 cursor-pointer" />
                  <span className="text-xs text-slate-600">Select all on this page</span>
                </div>
                <div className="space-y-2">
                  {skills.map(skill => (
                    <div key={skill.id} className={`bg-white/[0.03] border rounded-xl p-4 transition-colors ${selectedSkills.has(skill.id) ? 'border-amber-500/30 bg-amber-500/[0.03]' : 'border-white/[0.07]'}`}>
                      <div className="flex items-start gap-3">
                        <input type="checkbox" checked={selectedSkills.has(skill.id)}
                          onChange={() => toggleSkill(skill.id, selectedSkills, setSelectedSkills)}
                          className="mt-1 w-4 h-4 accent-amber-400 cursor-pointer shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-white text-sm">{skill.name}</span>
                            <Badge value={skill.status} />
                            <Badge value={skill.visibility} />
                          </div>
                          <p className="text-xs text-slate-400 line-clamp-1 mb-1">{skill.description}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                            <button onClick={() => filterByOrg(skill.orgId)} className="hover:text-slate-400 underline underline-offset-2 transition-colors truncate max-w-[120px]">
                              {skill.org?.name ?? skill.orgId.slice(0, 8)}
                            </button>
                            <span className="hidden sm:inline">{skill.org?.plan ?? '?'} plan</span>
                            <span>↑{skill.upvotes ?? 0}</span>
                            <span>{skill.useCount ?? 0} uses</span>
                            <span className="hidden sm:inline">{new Date(skill.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {skill.status !== 'approved' && (
                            <button onClick={() => singleApprove(skill.id)} title="Approve" className="px-2 py-1.5 text-[11px] bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-300 rounded-lg transition-colors">
                              <span className="hidden sm:inline">Approve</span><span className="sm:hidden">✓</span>
                            </button>
                          )}
                          <button onClick={() => singleReject(skill.id)} title="Reject" className="px-2 py-1.5 text-[11px] bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 rounded-lg transition-colors">
                            <span className="hidden sm:inline">Reject</span><span className="sm:hidden">↩</span>
                          </button>
                          <button onClick={() => singleDelete(skill.id)} title="Delete" className="px-2 py-1.5 text-[11px] bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg transition-colors">✕</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {skillTotal > 50 && (
                  <div className="flex items-center justify-center gap-2 mt-6">
                    <button disabled={skillPage === 1} onClick={() => setSkillPage(p => p - 1)} className="px-3 py-1.5 text-xs bg-white/[0.04] border border-white/[0.07] rounded-lg disabled:opacity-30 hover:bg-white/[0.07]">← Prev</button>
                    <span className="text-xs text-slate-500">Page {skillPage} of {Math.ceil(skillTotal / 50)}</span>
                    <button disabled={skillPage * 50 >= skillTotal} onClick={() => setSkillPage(p => p + 1)} className="px-3 py-1.5 text-xs bg-white/[0.04] border border-white/[0.07] rounded-lg disabled:opacity-30 hover:bg-white/[0.07]">Next →</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Organizations ─────────────────────────────────────────────── */}
        {tab === 'orgs' && (
          <div className="flex flex-col md:flex-row gap-4 md:gap-6">

            {/* List panel — hidden on mobile when detail is open */}
            <div className={`flex-1 min-w-0 ${activeOrg ? 'hidden md:block' : 'block'}`}>
              {/* Search + filter bar */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-0 sm:flex-none">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-xs">🔍</span>
                  <input
                    value={orgSearch}
                    onChange={e => { setOrgSearch(e.target.value); setOrgPage(1) }}
                    placeholder="Search orgs…"
                    className="pl-8 pr-3 py-1.5 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/40 w-full sm:w-44 transition-all"
                  />
                </div>
                <div className="flex gap-1 flex-wrap">
                  {[['', 'all'], ['free', 'free'], ['pro', 'pro'], ['enterprise', 'ent']].map(([v, label]) => (
                    <button key={v} onClick={() => { setOrgPlanFilter(v); setOrgPage(1) }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${orgPlanFilter === v ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <span className="ml-auto text-xs text-slate-600">{orgTotal}</span>
              </div>
              {orgsLoading ? (
                <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} />)}</div>
              ) : orgs.length === 0 ? (
                <p className="text-slate-600 text-sm">No orgs found.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {orgs.map(org => (
                      <button key={org.id} onClick={() => openOrg(org.id)}
                        className={`w-full text-left bg-white/[0.03] border rounded-xl p-4 transition-colors hover:bg-white/[0.05] ${activeOrg?.id === org.id ? 'border-amber-500/30 bg-amber-500/[0.03]' : 'border-white/[0.07]'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-semibold text-white text-sm truncate">{org.name}</span>
                              <Badge value={org.plan} />
                            </div>
                            <p className="text-[11px] text-slate-600">
                              {org.memberCount} members · {org.skillCount} skills · {new Date(org.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="text-slate-600 shrink-0">›</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  {orgTotal > 50 && (
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <button disabled={orgPage === 1} onClick={() => setOrgPage(p => p - 1)} className="px-3 py-1.5 text-xs bg-white/[0.04] border border-white/[0.07] rounded-lg disabled:opacity-30">← Prev</button>
                      <span className="text-xs text-slate-500">{orgPage} / {Math.ceil(orgTotal / 50)}</span>
                      <button disabled={orgPage * 50 >= orgTotal} onClick={() => setOrgPage(p => p + 1)} className="px-3 py-1.5 text-xs bg-white/[0.04] border border-white/[0.07] rounded-lg disabled:opacity-30">Next →</button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Org detail panel — full-width on mobile, fixed sidebar on desktop */}
            <div className={`w-full md:w-80 md:shrink-0 ${activeOrg ? 'block' : 'hidden md:block'}`}>
              {orgDetailLoading ? (
                <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} />)}</div>
              ) : activeOrg && editingOrg ? (
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5 md:sticky md:top-0">
                  {/* Mobile back button */}
                  <button onClick={() => setActiveOrg(null)} className="md:hidden flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-4">
                    ← Back to orgs
                  </button>

                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-semibold text-white truncate pr-2">{activeOrg.name}</h3>
                    <button onClick={() => setActiveOrg(null)} className="hidden md:block text-slate-600 hover:text-slate-400 shrink-0">✕</button>
                  </div>

                  <div className="mb-4">
                    <label className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1.5">Plan</label>
                    <select value={editingOrg.plan} onChange={e => setEditingOrg(v => v ? { ...v, plan: e.target.value } : v)}
                      className="w-full bg-black/40 border border-white/10 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500/50 transition-colors">
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>

                  <div className="mb-5">
                    <label className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1.5">
                      Approval threshold: <span className="text-amber-300">{editingOrg.threshold}</span>
                    </label>
                    <input type="range" min="1" max="10" value={editingOrg.threshold}
                      onChange={e => setEditingOrg(v => v ? { ...v, threshold: parseInt(e.target.value) } : v)}
                      className="w-full accent-amber-400" />
                    <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                      <span>1 (auto)</span><span>10 (strict)</span>
                    </div>
                  </div>

                  <button onClick={saveOrgEdits}
                    className="w-full py-2.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-300 rounded-lg text-sm font-medium transition-colors mb-3">
                    Save changes
                  </button>

                  <button onClick={() => filterByOrg(activeOrg.id)}
                    className="w-full py-2 text-xs bg-white/[0.04] border border-white/[0.07] text-slate-400 rounded-lg hover:bg-white/[0.07] transition-colors mb-5">
                    View all skills for this org →
                  </button>

                  <div className="mb-4">
                    <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Members ({activeOrg.members.length})</p>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {activeOrg.members.map(m => (
                        <div key={m.id} className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs text-slate-300 truncate">{m.name}</p>
                            <p className="text-[10px] text-slate-600 truncate">{m.email}</p>
                          </div>
                          <Badge value={m.role} />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Recent skills ({activeOrg.skills.length})</p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {activeOrg.skills.slice(0, 10).map(s => (
                        <div key={s.id} className="flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-300 truncate">{s.name}</span>
                          <div className="flex gap-1 shrink-0">
                            <Badge value={s.status} />
                            <Badge value={s.visibility} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="hidden md:flex text-center py-16 text-slate-700 text-sm border border-white/[0.04] rounded-xl items-center justify-center">
                  Click an org to view details
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'campaigns' && <CampaignsTab />}
        {tab === 'payments' && <PaymentsTab />}
        {tab === 'monitoring' && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h2 className="text-slate-200 font-semibold text-base mb-1">New Relic Integration</h2>
              <p className="text-slate-400 text-sm">Platform-level observability — configure once via Cloudflare secrets. Never exposed to tenants.</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-5">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">1. Set New Relic license key</p>
                <pre className="bg-slate-950 text-slate-300 rounded-lg p-3 text-xs font-mono border border-slate-800 overflow-x-auto">wrangler secret put NR_LICENSE_KEY --name skillmesh-api</pre>
                <p className="text-xs text-slate-500 mt-1.5">Use your New Relic Ingest — License key (found under API keys). Stored encrypted in Cloudflare.</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">2. (EU) Set region</p>
                <pre className="bg-slate-950 text-slate-300 rounded-lg p-3 text-xs font-mono border border-slate-800 overflow-x-auto">wrangler secret put NR_REGION --name skillmesh-api{'\n'}# Enter: eu</pre>
                <p className="text-xs text-slate-500 mt-1.5">Leave unset for US data center (default). Set to <code className="font-mono bg-slate-700 px-1 rounded">eu</code> for EU.</p>
              </div>
              <div className="border-t border-slate-700 pt-4">
                <p className="text-xs font-semibold text-slate-400 mb-2">Data sent to New Relic</p>
                <ul className="space-y-1.5 text-xs text-slate-500">
                  <li><code className="font-mono bg-slate-700 px-1 rounded text-slate-300">skillmesh.api.requests</code> — every request: method, path, status, duration</li>
                  <li><code className="font-mono bg-slate-700 px-1 rounded text-slate-300">skillmesh.chat.messages</code> — chat calls with provider tag</li>
                  <li><code className="font-mono bg-slate-700 px-1 rounded text-slate-300">skillmesh.workflow.runs</code> — workflow executions with status tag</li>
                  <li className="pt-1 text-slate-600">Logs — all of the above also sent as structured log events</li>
                </ul>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Flash toast */}
      {flashMsg && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-auto z-50 px-5 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-sm shadow-2xl backdrop-blur-sm text-center sm:text-left">
          {flashMsg}
        </div>
      )}
    </div>
  )
}
