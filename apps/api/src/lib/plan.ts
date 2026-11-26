export function isPro(org: { plan: string; trialEndsAt?: number | null }): boolean {
  if (org.plan === 'pro' || org.plan === 'enterprise') return true
  if (org.trialEndsAt && org.trialEndsAt > Date.now()) return true
  return false
}
