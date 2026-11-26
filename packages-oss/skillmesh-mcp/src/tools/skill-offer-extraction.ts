import type { SkillMeshClient } from '../client.js'
import type { SkillSubmitInput } from './skill-submit.js'

export interface SkillOfferOutput {
  offered: boolean
  draft: SkillSubmitInput
  message: string
}

export async function skillOfferExtraction(
  _client: SkillMeshClient,
  input: {
    taskDescription: string
    conversationSummary: string
    suggestedName?: string
    tokensUsed?: number
  },
): Promise<SkillOfferOutput> {
  const name = input.suggestedName
    ?? input.taskDescription
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .split(/\s+/)
        .slice(0, 6)
        .join('-')

  // Build a sensible template from the summary
  const templateLines = [
    input.conversationSummary,
    '',
    'Task: {{task_description}}',
    'Context: {{context}}',
  ]

  // Derive trigger phrases from task description
  const words = input.taskDescription.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
  const triggers = [
    input.taskDescription,
    words.slice(0, 4).join(' '),
    words.slice(0, 3).join(' '),
  ].filter((t, i, arr) => t.length > 3 && arr.indexOf(t) === i)

  const tokenEstimate = input.tokensUsed
    ?? Math.max(100, Math.ceil(templateLines.join('\n').length / 4))

  const draft: SkillSubmitInput = {
    name,
    description: input.taskDescription.charAt(0).toUpperCase() + input.taskDescription.slice(1),
    promptTemplate: templateLines.join('\n'),
    triggers,
    tags: [],
    toolsRequired: [],
    tokenEstimate,
    visibility: 'private',
  }

  return {
    offered: true,
    draft,
    message: [
      `This task looks reusable! Here's a draft skill based on what you just did.`,
      `Review the draft — especially the promptTemplate and triggers — then call skill_submit to share it with your team.`,
      `It will start as a draft and needs approval before appearing in resolve results.`,
    ].join(' '),
  }
}
