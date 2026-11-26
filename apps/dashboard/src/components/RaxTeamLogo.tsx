type Props = { size?: number; className?: string }

export default function RaxTeamLogo({ size = 32, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="rax-bg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        <linearGradient id="rax-shine" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Rounded square base */}
      <rect width="40" height="40" rx="10" fill="url(#rax-bg)" />
      <rect width="40" height="40" rx="10" fill="url(#rax-shine)" />

      {/* R letterform — bold geometric */}
      {/* Vertical stem */}
      <rect x="10" y="10" width="5" height="20" rx="1.5" fill="white" />
      {/* Top bowl cap */}
      <rect x="10" y="10" width="12" height="4.5" rx="1.5" fill="white" />
      {/* Bowl bottom bar */}
      <rect x="10" y="18" width="12" height="4.5" rx="1.5" fill="white" />
      {/* Right arc of the bowl — filled pill */}
      <rect x="19" y="10" width="5" height="13" rx="2.5" fill="white" />
      {/* Leg — diagonal slash down-right from bowl */}
      <rect
        x="17.5"
        y="21"
        width="5"
        height="11"
        rx="2"
        fill="white"
        transform="rotate(-22 17.5 21)"
      />

      {/* Dot accent — bottom right */}
      <circle cx="31" cy="31" r="3" fill="#a5b4fc" opacity="0.85" />
    </svg>
  )
}
