#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { SkillMeshClient } from './client.js'
import { resolveSkill } from './tools/resolve-skill.js'
import { listSkills } from './tools/list-skills.js'
import { skillSubmit } from './tools/skill-submit.js'
import { skillOfferExtraction } from './tools/skill-offer-extraction.js'
import type { SkillSubmitInput } from './tools/skill-submit.js'

const apiKey = process.env.SKILLMESH_API_KEY
const apiUrl = process.env.SKILLMESH_API_URL ?? 'https://api.raxteam.com'

if (!apiKey) {
  console.error('[skillmesh-mcp] SKILLMESH_API_KEY environment variable is required')
  process.exit(1)
}

const client = new SkillMeshClient(apiKey, apiUrl)

const server = new Server(
  { name: 'skillmesh-mcp', version: '0.2.0' },
  { capabilities: { tools: {} } },
)

// ── Tool definitions ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'resolve_skill',
      description: [
        'Find the best matching reusable skill for a task.',
        'Call this FIRST before attempting any complex task.',
        'If found (found:true), use the returned promptTemplate — fill {{variable}} placeholders with context from the user request.',
        'If ragContext is present (Pro plan), prepend those chunks to your prompt for richer, grounded responses.',
        'If not found (found:false), handle the task yourself then call skill_offer_extraction.',
      ].join(' '),
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Short action-focused description of the task (e.g. "summarize a support ticket", not the full user message)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'list_skills',
      description: 'List all approved skills in your organization. Use this to browse available skills or let the user choose one directly.',
      inputSchema: {
        type: 'object',
        properties: {
          visibility: {
            type: 'string',
            enum: ['private', 'shared', 'public'],
            description: 'Filter by visibility. Omit to return all.',
          },
        },
        required: [],
      },
    },
    {
      name: 'skill_submit',
      description: [
        'Submit a new skill to the SkillMesh registry for peer review.',
        'Use this when the user explicitly asks to save or publish a skill.',
        'The skill will be created as a draft — a curator or admin must approve it before it appears in resolve results.',
      ].join(' '),
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short descriptive name (kebab-case preferred)' },
          description: { type: 'string', description: 'One sentence: what does this skill do?' },
          promptTemplate: { type: 'string', description: 'The reusable prompt. Use {{variableName}} for placeholders.' },
          triggers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Natural language phrases that should match this skill (used for semantic search)',
          },
          tags: { type: 'array', items: { type: 'string' }, description: 'Topic tags' },
          toolsRequired: { type: 'array', items: { type: 'string' }, description: 'MCP tools or integrations this skill needs (e.g. ["github", "jira"])' },
          tokenEstimate: { type: 'number', description: 'Estimated tokens the filled prompt will consume' },
          visibility: {
            type: 'string',
            enum: ['private', 'shared', 'public'],
            description: 'private = org only (default), shared = shared with partner orgs, public = SkillMesh marketplace',
          },
        },
        required: ['name', 'description', 'promptTemplate', 'triggers', 'tags', 'toolsRequired', 'tokenEstimate'],
      },
    },
    {
      name: 'skill_offer_extraction',
      description: [
        'After completing a task that had no matching skill, offer to save the approach as a reusable skill.',
        'Call this at the END of a task when resolve_skill returned found:false.',
        'Returns a draft skill for the user to review. If they approve, call skill_submit with the draft.',
      ].join(' '),
      inputSchema: {
        type: 'object',
        properties: {
          taskDescription: { type: 'string', description: 'What was the task?' },
          conversationSummary: { type: 'string', description: 'Brief description of the approach and prompt structure used' },
          suggestedName: { type: 'string', description: 'Optional kebab-case name for the skill' },
          tokensUsed: { type: 'number', description: 'Tokens consumed in this run (for tokenEstimate)' },
        },
        required: ['taskDescription', 'conversationSummary'],
      },
    },
  ],
}))

// ── Tool handlers ────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params

  try {
    let result: unknown

    switch (name) {
      case 'resolve_skill':
        result = await resolveSkill(client, args as { query: string })
        break

      case 'list_skills':
        result = await listSkills(client, args as { visibility?: string })
        break

      case 'skill_submit':
        result = await skillSubmit(client, args as unknown as SkillSubmitInput)
        break

      case 'skill_offer_extraction':
        result = await skillOfferExtraction(
          client,
          args as { taskDescription: string; conversationSummary: string; suggestedName?: string; tokensUsed?: number },
        )
        break

      default:
        throw new Error(`Unknown tool: ${name}`)
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    }
  }
})

// ── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
