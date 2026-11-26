import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { clearToken } from '../lib/api'
import { useEffect, useState } from 'react'
import { api, type User, type Org } from '../lib/api'
import RaxTeamLogo from './RaxTeamLogo'

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState<User | null>(null)
  const [org, setOrg] = useState<Org | null>(null)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviting, setInviting] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [trialBannerDismissed, setTrialBannerDismissed] = useState(() => sessionStorage.getItem('trial_banner_dismissed') === '1')
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  function toggleSection(name: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  useEffect(() => {
    api.me().then(({ user, org }) => { setUser(user); setOrg(org) }).catch(() => {})
  }, [])

  function dismissTrialBanner() {
    sessionStorage.setItem('trial_banner_dismissed', '1')
    setTrialBannerDismissed(true)
  }

  const showTrialBanner = !trialBannerDismissed && !!(org?.trialEndsAt && org.trialEndsAt > Date.now() && org.plan === 'free')
  const trialDaysLeft = org?.trialEndsAt ? Math.max(0, Math.ceil((org.trialEndsAt - Date.now()) / (1000 * 60 * 60 * 24))) : 0

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  function logout() { clearToken(); navigate('/') }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true); setInviteError(''); setInviteUrl('')
    try {
      const result = await api.members.invites.create(inviteEmail, inviteRole)
      setInviteUrl(result.inviteUrl); setInviteEmail('')
    } catch (err: unknown) {
      setInviteError((err as Error).message)
    } finally { setInviting(false) }
  }

  function closeModal() {
    setShowInviteModal(false); setInviteUrl(''); setInviteError('')
    setInviteEmail(''); setInviteRole('member')
  }

  const pageTitle: Record<string, string> = {
    '/skills/new': 'New Skill', '/skills': 'Skills',
    '/resolve': 'Resolve', '/playground': 'Playground', '/chat': 'Chat', '/settings/chat': 'Chat Settings', '/members': 'Members',
    '/upgrade': 'Upgrade', '/integration': 'Integration', '/workflows': 'Workflows',
  }
  const title = Object.entries(pageTitle).find(([k]) => location.pathname.startsWith(k))?.[1] ?? 'RaxTeam'

  const navItem = 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group w-full'
  const active = 'bg-gradient-to-r from-brand-600/25 to-violet-600/10 text-brand-300 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.25)]'
  const inactive = 'text-slate-400 hover:text-slate-100 hover:bg-white/6'

  type NavSection = { section: string; links: { to: string; end: boolean; label: string; icon: React.ReactNode; badge?: string }[] }
  const navSections: NavSection[] = [
    {
      section: 'Build',
      links: [
        { to: '/skills', end: false, label: 'Skills', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /> },
        { to: '/skill-builder', end: false, label: 'Skill Builder', badge: 'PRO', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /> },
        { to: '/workflow-builder', end: false, label: 'Workflow Builder', badge: 'PRO', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /> },
        { to: '/workflows', end: false, label: 'Workflows', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /> },
        { to: '/secrets', end: false, label: 'Secrets', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /> },
        { to: '/chat', end: true, label: 'Chat', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /> },
        { to: '/chat-endpoints', end: false, label: 'Chat Endpoints', badge: 'PRO', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" /> },
      ],
    },
    {
      section: 'Explore',
      links: [
        { to: '/playground', end: true, label: 'Playground', icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></> },
        { to: '/resolve', end: true, label: 'Resolve', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /> },
      ],
    },
    {
      section: 'Team',
      links: [
        { to: '/members', end: true, label: 'Members', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /> },
        { to: '/integration', end: true, label: 'Integration', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
      ],
    },
    {
      section: 'Account',
      links: [
        { to: '/profile', end: true, label: 'Profile', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /> },
        { to: '/contact', end: true, label: 'Contact', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /> },
      ],
    },
  ]

  const sidebar = (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute -top-20 -left-10 w-48 h-48 bg-brand-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 -right-10 w-32 h-32 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Logo + close */}
      <div className="flex items-center justify-between px-5 py-4 relative">
        <div className="flex items-center gap-3">
          <RaxTeamLogo size={32} className="shrink-0 shadow-lg" />
          <div>
            <p className="text-sm font-bold text-white tracking-tight leading-none">RaxTeam</p>
            {org && <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[100px]">{org.name}</p>}
          </div>
        </div>
        {/* Close — mobile only */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="md:hidden flex items-center justify-center w-8 h-8 rounded-xl text-slate-500 hover:text-slate-200 hover:bg-white/8 transition-all duration-150"
          aria-label="Close menu"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Plan badge */}
      {org && (
        <div className="px-5 pt-3 pb-1">
          <span className={`inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider ${
            org.plan === 'free'
              ? 'bg-slate-800/80 text-slate-500 border border-slate-700/50'
              : 'bg-brand-900/60 text-brand-400 border border-brand-800/50'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${org.plan === 'free' ? 'bg-slate-600' : 'bg-brand-400'}`} />
            {org.plan}
          </span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 relative overflow-y-auto space-y-4 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb]:rounded-full scrollbar-thin">
        {navSections.map(section => (
          <div key={section.section}>
            <button
              onClick={() => toggleSection(section.section)}
              className="w-full flex items-center justify-between px-3 pb-1.5 group"
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600/80 group-hover:text-slate-500 transition-colors">{section.section}</p>
              <svg className={`w-2.5 h-2.5 text-slate-700 transition-transform duration-200 ${collapsedSections.has(section.section) ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {!collapsedSections.has(section.section) && (
              <div className="space-y-0.5">
                {section.links.map(link => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.end}
                    className={({ isActive }) => `${navItem} ${isActive ? active : inactive}`}
                  >
                    {({ isActive }) => (
                      <>
                        <svg className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-brand-400' : 'text-slate-500 group-hover:text-slate-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          {link.icon}
                        </svg>
                        <span>{link.label}</span>
                        {link.badge && <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-900/60 text-brand-400 border border-brand-800/50 uppercase tracking-wider">{link.badge}</span>}
                        {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}

        {user?.role === 'admin' && (
          <div>
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600/80">Admin</p>
            <div className="space-y-0.5">
              <button onClick={() => setShowInviteModal(true)} className={`${navItem} ${inactive}`}>
                <svg className="w-4 h-4 shrink-0 text-slate-500 group-hover:text-slate-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                <span>Invite Member</span>
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Upgrade CTA for free orgs */}
      {org?.plan === 'free' && (
        <div className="px-3 pb-2 relative">
          <NavLink
            to="/upgrade"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-gradient-to-r from-brand-600/20 to-violet-600/15 border border-brand-500/20 text-brand-300 hover:from-brand-600/30 hover:to-violet-600/25 transition-all duration-200 group"
          >
            <svg className="w-4 h-4 shrink-0 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold leading-none">Upgrade to Pro</p>
              <p className="text-[10px] text-brand-500 mt-0.5">Unlimited skills & seats</p>
            </div>
          </NavLink>
        </div>
      )}

      {/* User footer */}
      <div className="px-3 pb-3 pt-2 relative">
        {user && (
          <NavLink to="/profile" className="flex items-center gap-3 px-3 py-2.5 mb-1 rounded-xl bg-white/4 border border-white/6 hover:bg-white/8 hover:border-white/10 transition-all group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white shadow-md shrink-0">
              {user.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate leading-none mb-0.5">{user.name}</p>
              <p className="text-[10px] text-slate-500 capitalize">{user.role}</p>
            </div>
            <svg className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </NavLink>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:text-slate-300 hover:bg-white/5 rounded-xl transition-all duration-150 group"
        >
          <svg className="w-3.5 h-3.5 group-hover:text-red-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div className="h-screen flex overflow-hidden bg-[#f8f9fb]">

      {/* Overlay — mobile only, fades in/out */}
      <div
        className={`fixed inset-0 z-30 md:hidden transition-all duration-300 ${
          sidebarOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'rgba(7,10,16,0.75)', backdropFilter: 'blur(4px)' }}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-[#0c0e14]
        shadow-[4px_0_40px_rgba(0,0,0,0.6)]
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0 md:flex md:flex-col md:shrink-0 md:h-full
      `}>
        {sidebar}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 bg-white/95 backdrop-blur-sm border-b border-gray-200/80 flex items-center justify-between px-4 md:px-6 shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            {/* Hamburger */}
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-all duration-150 active:scale-95"
              aria-label="Toggle menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {sidebarOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                }
              </svg>
            </button>
            <h1 className="text-sm font-semibold text-gray-800 tracking-tight">{title}</h1>
          </div>

          <div className="flex items-center gap-2">
            {user?.role === 'admin' && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg text-xs font-semibold transition-colors border border-brand-200 active:scale-95"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Invite
              </button>
            )}
            {user && (
              <NavLink to="/profile" className="flex items-center gap-2 pl-2 border-l border-gray-200 ml-1 hover:opacity-80 transition-opacity">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm">
                  {user.name[0]?.toUpperCase()}
                </div>
                <div className="hidden sm:block leading-none">
                  <p className="text-xs font-semibold text-gray-800">{user.name}</p>
                  <p className="text-[10px] text-gray-400 capitalize mt-0.5">{user.role}</p>
                </div>
              </NavLink>
            )}
          </div>
        </header>

        {showTrialBanner && (
          <div className="shrink-0 flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-amber-800">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span>🎉</span>
              <span>You're on a 15-day free trial · {trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'} left ·</span>
              <NavLink to="/upgrade" className="underline font-semibold hover:text-amber-900">Upgrade to keep access →</NavLink>
            </div>
            <button onClick={dismissTrialBanner} className="shrink-0 p-1 hover:bg-amber-100 rounded-lg transition-colors" aria-label="Dismiss">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-[fadeIn_0.15s_ease]">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Invite a member</h2>
                <p className="text-sm text-gray-500 mt-0.5">They'll receive a link to join your org</p>
              </div>
              <button onClick={closeModal} className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {inviteUrl ? (
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-800 mb-1">Invite link created!</p>
                <p className="text-xs text-gray-500 mb-4">Share this link with your teammate</p>
                <div className="flex gap-2 mb-4">
                  <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-700 truncate text-left">{inviteUrl}</code>
                  <button onClick={() => navigator.clipboard.writeText(inviteUrl)} className="shrink-0 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold transition-colors">Copy</button>
                </div>
                <p className="text-xs text-gray-400 mb-4">Expires in 7 days</p>
                <button onClick={closeModal} className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">Done</button>
              </div>
            ) : (
              <form onSubmit={sendInvite} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Email address</label>
                  <input
                    required type="email" value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Role</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['member', 'curator', 'admin'] as const).map(r => (
                      <button key={r} type="button" onClick={() => setInviteRole(r)}
                        className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                          inviteRole === r ? 'bg-brand-600 border-brand-600 text-white shadow-sm' : 'border-gray-200 text-gray-600 hover:border-brand-200 hover:text-brand-600'
                        }`}
                      >
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2 h-4">
                    {inviteRole === 'member' && 'Can create and use skills'}
                    {inviteRole === 'curator' && 'Can create, use, and approve skills'}
                    {inviteRole === 'admin' && 'Full access including member management'}
                  </p>
                </div>
                {inviteError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{inviteError}</p>}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={closeModal} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">Cancel</button>
                  <button type="submit" disabled={inviting} className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">
                    {inviting ? 'Sending…' : 'Send Invite'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
