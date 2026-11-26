import { useState, useEffect } from 'react'
import { SA_API, getSAToken } from '../lib/superadmin'

async function saJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SA_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${getSAToken()}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; throw new Error(e.error ?? res.statusText) }
  return res.json()
}

type Payment = {
  id: string
  name: string
  slug: string
  plan: string
  paymentId: string | null
  orderId: string | null
  rzp: {
    amount: number
    currency: string
    status: string
    method: string
    email: string
    contact: string
    createdAt: number
    refundStatus: string | null
    amountRefunded: number
  } | null
}

function fmt(paise: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(paise / 100)
}

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function statusBadge(status: string, refundStatus: string | null) {
  if (refundStatus === 'full') return <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/15 text-red-400 border border-red-500/20">Refunded</span>
  if (refundStatus === 'partial') return <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/15 text-amber-400 border border-amber-500/20">Partial refund</span>
  if (status === 'captured') return <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Paid</span>
  return <span className="px-2 py-0.5 rounded-full text-xs bg-white/10 text-white/50">{status}</span>
}

function RefundModal({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'full' | 'partial'>('full')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const maxPaise = (payment.rzp?.amount ?? 0) - (payment.rzp?.amountRefunded ?? 0)
  const maxAmount = (maxPaise / 100).toFixed(2)

  async function submit() {
    setLoading(true); setError('')
    try {
      const amountPaise = mode === 'full' ? maxPaise : Math.round(parseFloat(amount) * 100)
      if (mode === 'partial' && (isNaN(amountPaise) || amountPaise <= 0 || amountPaise > maxPaise)) {
        setError(`Enter a valid amount up to ${fmt(maxPaise)}`); setLoading(false); return
      }
      await saJSON(`/payments/${payment.paymentId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ amount: amountPaise, reason }),
      })
      onDone()
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-[#0d0f16] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-white font-semibold text-base mb-1">Issue Refund</h3>
        <p className="text-white/40 text-xs mb-5">
          {payment.name} · {payment.rzp?.email} · paid {fmt(payment.rzp?.amount ?? 0)}
          {payment.rzp?.amountRefunded ? ` · ₹${(payment.rzp.amountRefunded / 100).toFixed(0)} already refunded` : ''}
        </p>

        <div className="flex gap-2 mb-4">
          {(['full', 'partial'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${mode === m ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-white/10 text-white/40 hover:border-white/20'}`}>
              {m === 'full' ? `Full refund (${fmt(maxPaise)})` : 'Partial refund'}
            </button>
          ))}
        </div>

        {mode === 'partial' && (
          <div className="mb-4">
            <label className="block text-xs text-white/40 mb-1.5">Amount (INR, max ₹{maxAmount})</label>
            <input type="number" step="0.01" max={maxAmount} value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
              placeholder={`e.g. ${(maxPaise / 200).toFixed(2)}`} />
          </div>
        )}

        <div className="mb-5">
          <label className="block text-xs text-white/40 mb-1.5">Reason (optional)</label>
          <input type="text" value={reason} onChange={e => setReason(e.target.value)} maxLength={200}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
            placeholder="Customer requested, duplicate payment…" />
        </div>

        {error && <p className="text-red-400 text-xs mb-4">{error}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-white/10 rounded-xl text-sm text-white/50 hover:text-white transition-all">Cancel</button>
          <button onClick={submit} disabled={loading}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-xl text-sm font-semibold text-white transition-all">
            {loading ? 'Processing…' : 'Confirm refund'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PaymentsTab() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refunding, setRefunding] = useState<Payment | null>(null)
  const [toast, setToast] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const data = await saJSON<{ payments: Payment[] }>('/payments')
      setPayments(data.payments)
    } catch (e: unknown) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500) }

  async function handleRefundDone() {
    setRefunding(null)
    showToast('Refund issued successfully')
    await load()
  }

  const totalRevenue = payments.reduce((sum, p) => sum + (p.rzp?.amount ?? 0) - (p.rzp?.amountRefunded ?? 0), 0)
  const totalRefunded = payments.reduce((sum, p) => sum + (p.rzp?.amountRefunded ?? 0), 0)
  const paidCount = payments.filter(p => p.plan === 'pro' || p.plan === 'enterprise').length

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total payments', value: payments.length },
          { label: 'Active Pro orgs', value: paidCount },
          { label: 'Net revenue', value: fmt(totalRevenue) },
          { label: 'Total refunded', value: fmt(totalRefunded) },
        ].map(s => (
          <div key={s.label} className="bg-white/[0.03] border border-white/8 rounded-xl p-4">
            <p className="text-white/40 text-xs mb-1">{s.label}</p>
            <p className="text-white font-semibold text-lg">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white/[0.02] border border-white/8 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between">
          <p className="text-white/60 text-sm font-medium">Payment history</p>
          <button onClick={load} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">↻ Refresh</button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-white/30 text-sm">Loading payments…</div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-sm">{error}</div>
        ) : payments.length === 0 ? (
          <div className="p-8 text-center text-white/30 text-sm">No payments yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/6 text-white/30 text-xs uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Organization</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Contact</th>
                  <th className="text-left px-4 py-3">Amount</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Method</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Date</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {payments.map(p => (
                  <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4">
                      <p className="text-white font-medium">{p.name}</p>
                      <p className="text-white/30 text-xs">{p.paymentId}</p>
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <p className="text-white/60 text-xs">{p.rzp?.email ?? '—'}</p>
                      <p className="text-white/30 text-xs">{p.rzp?.contact ?? ''}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-white font-medium">{p.rzp ? fmt(p.rzp.amount, p.rzp.currency) : '—'}</p>
                      {(p.rzp?.amountRefunded ?? 0) > 0 && (
                        <p className="text-red-400 text-xs">-{fmt(p.rzp!.amountRefunded, p.rzp!.currency)} refunded</p>
                      )}
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <span className="text-white/50 text-xs capitalize">{p.rzp?.method ?? '—'}</span>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <span className="text-white/50 text-xs">{p.rzp ? fmtDate(p.rzp.createdAt) : '—'}</span>
                    </td>
                    <td className="px-4 py-4">
                      {p.rzp ? statusBadge(p.rzp.status, p.rzp.refundStatus) : <span className="text-white/20 text-xs">no data</span>}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {p.paymentId && p.rzp?.refundStatus !== 'full' && p.rzp?.status === 'captured' && (
                        <button onClick={() => setRefunding(p)}
                          className="px-3 py-1.5 text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                          Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {refunding && (
        <RefundModal payment={refunding} onClose={() => setRefunding(null)} onDone={handleRefundDone} />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white text-sm px-4 py-3 rounded-xl shadow-xl z-50 transition-all">
          ✓ {toast}
        </div>
      )}
    </div>
  )
}
