import type { SkillMeshClient } from '../client.js'

export interface SkillSubmitInput {
  name: string
  description: string
  promptTemplate: string
  triggers: string[]
  tags: string[]
  toolsRequired: string[]
  tokenEstimate: number
  visibility?: 'private' | 'public'
}

export async function skillSubmit(
  client: SkillMeshClient,
  input: SkillSubmitInput,
): Promise<{ submitted: boolean; skillId: string; message: string }> {
  const result = await client.submitSkill(input)
  return {
    submitted: true,
    skillId: result.id,
    message: `Skill "${input.name}" submitted (id: ${result.id}). It is now in draft status. Share the skill ID with a teammate to request approval, or visit skillmesh.io to manage it.`,
  }
}
