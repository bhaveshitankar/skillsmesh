import type { SkillMeshClient, ResolveSkillResponse } from '../client.js'

export interface ResolveSkillOutput {
  found: boolean
  skillId?: string
  skillName?: string
  promptTemplate?: string
  tokenEstimate?: number
  score?: number
  ragContext?: Array<{ fileName: string; content: string; score: number }>
  message: string
}

export async function resolveSkill(
  client: SkillMeshClient,
  input: { query: string },
): Promise<ResolveSkillOutput> {
  const result: ResolveSkillResponse = await client.resolveSkill(input.query)

  if (result.found && result.match) {
    const { skill, score } = result.match

    // Fire-and-forget usage log
    client.logUsage({
      skillId: skill.id,
      queryText: input.query,
      matchScore: score,
      outcome: 'used',
    }).catch(() => {})

    const ragContext = result.ragContext?.map(c => ({
      fileName: c.fileName,
      content: c.content,
      score: c.score,
    }))

    const ragNote = ragContext && ragContext.length > 0
      ? ` ${ragContext.length} relevant context chunk(s) from attached assets are included in ragContext — inject them before your prompt for richer responses.`
      : ''

    return {
      found: true,
      skillId: skill.id,
      skillName: skill.name,
      promptTemplate: skill.promptTemplate,
      tokenEstimate: skill.tokenEstimate,
      score,
      ragContext,
      message: `Found skill "${skill.name}" (${Math.round(score * 100)}% match). Fill {{variables}} in the promptTemplate with values from the user's request.${ragNote}`,
    }
  }

  client.logUsage({ queryText: input.query, outcome: 'fallback' }).catch(() => {})

  const hint = result.topCandidates.length > 0
    ? `Closest candidate: "${result.topCandidates[0].skill.name}" (${Math.round(result.topCandidates[0].score * 100)}% — below threshold). `
    : ''

  return {
    found: false,
    message: `No strong skill match found. ${hint}Handle this task normally, then call skill_offer_extraction to save it as a reusable skill.`,
  }
}
