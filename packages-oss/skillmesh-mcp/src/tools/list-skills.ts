import type { SkillMeshClient } from '../client.js'

export interface ListSkillsOutput {
  count: number
  skills: Array<{ id: string; name: string; description: string; triggers: string[]; status: string }>
  message: string
}

export async function listSkills(
  client: SkillMeshClient,
  input: { visibility?: string },
): Promise<ListSkillsOutput> {
  const result = await client.listSkills(input.visibility)
  const approved = result.skills.filter(s => s.status === 'approved')
  return {
    count: approved.length,
    skills: approved.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      triggers: s.triggers,
      status: s.status,
    })),
    message: approved.length > 0
      ? `Found ${approved.length} approved skill(s) in your org. Use resolve_skill to find the best match for a specific task.`
      : 'No approved skills yet. Create and approve skills via the SkillMesh dashboard.',
  }
}
