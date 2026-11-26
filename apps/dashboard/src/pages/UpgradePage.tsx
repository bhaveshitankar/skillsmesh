import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Org } from '../lib/api'

// Load Razorpay checkout.js and open the payment popup
function openRazorpay(options: Record<string, unknown>): Promise<{
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}> {
  return new Promise((resolve, reject) => {
    if (!(window as unknown as Record<string, unknown>).Razorpay) {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => launch()
      script.onerror = () => reject(new Error('Failed to load Razorpay'))
      document.head.appendChild(script)
    } else {
      launch()
    }

    function launch() {
      const RazorpayClass = (window as unknown as Record<string, unknown>).Razorpay as new (opts: Record<string, unknown>) => { open(): void }
      const rzp = new RazorpayClass({
        ...options,
        handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => resolve(response),
        modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
      })
      rzp.open()
    }
  })
}

const FREE_FEATURES = [
  '25 private skills',
  '500 resolver calls / month',
  '5 team members',
  '384-dim embeddings (bge-small)',
  'Skill approval workflow',
  'BYOK playground',
]

const PRO_FEATURES = [
  'Unlimited private skills',
  'Unlimited resolver calls',
  'Unlimited team members',
  '768-dim embeddings (bge-base) — higher accuracy',
  'Priority embedding queue',
  'Shared & public skill marketplace',
  'Usage analytics dashboard',
  'Priority support',
  'Skill Builder — upload docs or links to auto-generate skills',
  'Secrets Manager — secure credentials for workflows',
  '15-day free trial for new accounts',
]

const PLANS = [
  {
    id: 'pro_monthly',
    name: 'Pro',
    price: 49,
    period: 'month',
    badge: null,
    color: 'from-brand-600 to-violet-600',
    cta: 'Upgrade to Pro',
  },
  {
    id: 'pro_annual',
    name: 'Pro Annual',
    price: 35,
    period: 'month',
    badge: 'Save 29%',
    color: 'from-violet-600 to-fuchsia-600',
    cta: 'Upgrade & Save',
  },
]

export default function UpgradePage() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState('pro_monthly')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [org, setOrg] = useState<Org | null>(null)
  const [startingTrial, setStartingTrial] = useState(false)
  const [trialStarted, setTrialStarted] = useState(false)

  useEffect(() => {
    api.me().then(({ org }) => setOrg(org)).catch(() => {})
  }, [])

  const isOnTrial = !!(org?.trialEndsAt && org.trialEndsAt > Date.now() && org.plan === 'free')
  const trialEndDate = org?.trialEndsAt ? new Date(org.trialEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''

  async function handleStartTrial() {
    setStartingTrial(true)
    try {
      const token = localStorage.getItem('token') || ''
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? 'https://api.raxteam.com'}/billing/start-trial`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        alert(data.error ?? 'Failed to start trial')
      } else {
        setTrialStarted(true)
      }
    } catch {
      alert('Network error')
    } finally {
      setStartingTrial(false)
    }
  }

  async function startCheckout() {
    setCheckoutLoading(true)
    setCheckoutError('')
    try {
      const order = await api.billing.order(selected as 'pro_monthly' | 'pro_annual')
      const payment = await openRazorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'RaxTeam',
        description: selected === 'pro_annual' ? 'Pro Annual Plan' : 'Pro Monthly Plan',
        order_id: order.orderId,
        prefill: order.prefill,
        theme: { color: '#6366f1' },
      })
      await api.billing.verify({ ...payment, plan: selected })
      navigate('/billing/success')
    } catch (err: unknown) {
      const msg = (err as Error).message
      if (msg !== 'Payment cancelled') setCheckoutError(msg)
      setCheckoutLoading(false)
    }
  }



  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-white p-4 md:p-10">
      <div className="max-w-4xl mx-auto">

        {/* Trial banner */}
        {isOnTrial && (
          <div className="mb-8 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-amber-800">
            <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-sm font-medium">Your 15-day trial is active — upgrade now to keep access after {trialEndDate}.</p>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-brand-600 bg-brand-50 border border-brand-200 px-3 py-1 rounded-full mb-4">
            Upgrade your plan
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight mb-3">
            Unlock the full power of RaxTeam
          </h1>
          <p className="text-gray-500 max-w-xl mx-auto text-base">
            Higher accuracy skill matching, unlimited team seats, and no monthly resolver limits.
          </p>
        </div>

        {/* Free trial CTA */}
        {org && org.plan === 'free' && !org.trialEndsAt && !trialStarted && (
          <div className="mb-8 bg-gradient-to-r from-brand-600/10 to-violet-600/10 border border-brand-200 rounded-2xl p-6 text-center">
            <div className="text-3xl mb-3">🎉</div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Start your 15-day free trial</h3>
            <p className="text-sm text-gray-500 mb-4">Get full Pro access — Skill Builder, Secrets, Chat, Workflows — free for 15 days. No credit card required.</p>
            <button
              onClick={handleStartTrial}
              disabled={startingTrial}
              className="px-8 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-semibold transition-all shadow-md disabled:opacity-50"
            >
              {startingTrial ? 'Starting…' : 'Start Free Trial →'}
            </button>
          </div>
        )}
        {trialStarted && (
          <div className="mb-8 bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
            <div className="text-3xl mb-2">✅</div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Trial activated!</h3>
            <p className="text-sm text-gray-500">You have 15 days of Pro access. Explore all features and upgrade before it ends.</p>
          </div>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">

          {/* Free */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Current plan</p>
              <p className="text-2xl font-bold text-gray-900">Free</p>
              <p className="text-sm text-gray-400 mt-0.5">$0 / month forever</p>
            </div>
            <ul className="space-y-2.5 flex-1 mb-6">
              {FREE_FEATURES.map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <div className="py-2.5 text-center text-sm text-gray-400 border border-gray-200 rounded-xl font-medium">
              Current plan
            </div>
          </div>

          {/* Pro plans */}
          {PLANS.map(plan => (
            <div
              key={plan.id}
              onClick={() => setSelected(plan.id)}
              className={`relative bg-white rounded-2xl border-2 p-6 flex flex-col cursor-pointer transition-all duration-200 ${
                selected === plan.id
                  ? 'border-brand-500 shadow-lg shadow-brand-100'
                  : 'border-gray-200 hover:border-brand-300'
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                  {plan.badge}
                </span>
              )}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">{plan.name}</p>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    selected === plan.id ? 'border-brand-500 bg-brand-500' : 'border-gray-300'
                  }`}>
                    {selected === plan.id && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-gray-900">${plan.price}</span>
                  <span className="text-sm text-gray-400">/ {plan.period}</span>
                </div>
                {plan.id === 'pro_annual' && (
                  <p className="text-xs text-violet-600 font-medium mt-0.5">Billed as $420/year</p>
                )}
              </div>
              <ul className="space-y-2.5 flex-1 mb-6">
                {PRO_FEATURES.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <svg className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-3">
          {checkoutError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-2 rounded-xl">{checkoutError}</p>
          )}
          <button
            onClick={startCheckout}
            disabled={checkoutLoading}
            className="flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-brand-600 to-violet-600 hover:from-brand-500 hover:to-violet-500 disabled:opacity-60 text-white rounded-xl font-semibold text-sm shadow-lg shadow-brand-200 transition-all active:scale-95"
          >
            {checkoutLoading
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            }
            {checkoutLoading ? 'Opening payment…' : PLANS.find(p => p.id === selected)?.cta ?? 'Upgrade'}
          </button>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <svg className="w-3.5 h-3.5 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Secured by Razorpay · Cancel anytime ·{' '}
            <a href="mailto:hello@raxteam.com" className="text-brand-600 hover:underline">hello@raxteam.com</a>
          </div>
        </div>

        {/* Compare table */}
        <div className="mt-14">
          <h2 className="text-lg font-bold text-gray-800 mb-5 text-center">Full feature comparison</h2>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-6 py-3.5 font-semibold text-gray-600 w-1/2">Feature</th>
                  <th className="text-center px-4 py-3.5 font-semibold text-gray-500">Free</th>
                  <th className="text-center px-4 py-3.5 font-semibold text-brand-600">Pro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  ['Private skills', '25', 'Unlimited'],
                  ['Resolver calls / month', '500', 'Unlimited'],
                  ['Team members', '5', 'Unlimited'],
                  ['Embedding model', 'bge-small (384-dim)', 'bge-base (768-dim)'],
                  ['Similarity threshold', '0.82', '0.85 (higher precision)'],
                  ['Skill approval workflow', '✓', '✓'],
                  ['BYOK playground', '✓', '✓'],
                  ['Shared / public skills', '—', '✓'],
                  ['Usage analytics', '—', '✓'],
                  ['Priority queue', '—', '✓'],
                  ['Priority support', '—', '✓'],
                ].map(([feature, free, pro]) => (
                  <tr key={feature} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-3 text-gray-700">{feature}</td>
                    <td className="px-4 py-3 text-center text-gray-400">{free}</td>
                    <td className="px-4 py-3 text-center text-brand-600 font-medium">{pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-center mt-8">
          <button onClick={() => navigate(-1)} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← Back
          </button>
        </div>
      </div>
    </div>
  )
}
