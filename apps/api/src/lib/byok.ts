import { BYOK_KEY_TTL_SECONDS } from '@skillmesh/shared'

function byokKey(orgId: string, userId: string): string {
  return `byok:${orgId}:${userId}`
}

export async function storeKey(
  kv: KVNamespace,
  orgId: string,
  userId: string,
  apiKey: string,
): Promise<void> {
  await kv.put(byokKey(orgId, userId), apiKey, { expirationTtl: BYOK_KEY_TTL_SECONDS })
}

export async function getKey(
  kv: KVNamespace,
  orgId: string,
  userId: string,
): Promise<string | null> {
  return kv.get(byokKey(orgId, userId))
}

export async function deleteKey(
  kv: KVNamespace,
  orgId: string,
  userId: string,
): Promise<void> {
  await kv.delete(byokKey(orgId, userId))
}
