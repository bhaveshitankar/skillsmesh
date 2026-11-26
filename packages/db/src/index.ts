import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

export { schema }
export type { InferSelectModel, InferInsertModel } from 'drizzle-orm'
export { workflows, workflowVersions, workflowRuns, orgSecrets } from './schema'

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}
