type Status = 'draft' | 'pending' | 'approved' | 'deprecated'

const styles: Record<Status, { badge: string; dot: string; label: string }> = {
  draft: {
    badge: 'bg-slate-100 text-slate-600 border border-slate-200',
    dot: 'bg-slate-400',
    label: 'Draft',
  },
  pending: {
    badge: 'bg-amber-50 text-amber-700 border border-amber-200',
    dot: 'bg-amber-400',
    label: 'Pending',
  },
  approved: {
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    dot: 'bg-emerald-500',
    label: 'Approved',
  },
  deprecated: {
    badge: 'bg-red-50 text-red-600 border border-red-200',
    dot: 'bg-red-400',
    label: 'Deprecated',
  },
}

export default function StatusBadge({ status }: { status: Status }) {
  const s = styles[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  )
}
