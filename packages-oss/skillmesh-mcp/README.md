# @skillmesh/mcp

MCP server for [SkillMesh](https://raxteam.com) — discover, reuse, and contribute AI skills across your team directly from Claude, Cursor, Windsurf, or any MCP-compatible LLM.

## What it does

Instead of every developer writing their own prompts, SkillMesh gives your LLM a shared, curated library of approved prompt templates. The MCP server exposes four tools:

| Tool | When to use |
|------|-------------|
| `resolve_skill` | **Before any complex task** — finds the best matching skill |
| `list_skills` | Browse all approved skills in your org |
| `skill_submit` | Submit a new skill for peer review |
| `skill_offer_extraction` | After a task with no match — draft a skill to save it |

## Quick start

### 1. Get your API key

Log in at [raxteam.com](https://raxteam.com), then find your key at **Integration → Your API key**.

### 2. Configure Claude Desktop

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json  (macOS)
// %APPDATA%\Claude\claude_desktop_config.json                       (Windows)
{
  "mcpServers": {
    "skillmesh": {
      "command": "npx",
      "args": ["-y", "@skillmesh/mcp"],
      "env": {
        "SKILLMESH_API_KEY": "sk-your-api-key"
      }
    }
  }
}
```

### 3. Configure Cursor / Windsurf

```json
// .cursor/mcp.json  (project root)
{
  "mcpServers": {
    "skillmesh": {
      "command": "npx",
      "args": ["-y", "@skillmesh/mcp"],
      "env": {
        "SKILLMESH_API_KEY": "sk-your-api-key"
      }
    }
  }
}
```

Restart your IDE. The four SkillMesh tools will appear automatically.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SKILLMESH_API_KEY` | ✅ | — | Your SkillMesh API key |
| `SKILLMESH_API_URL` | — | `https://api.raxteam.com` | Custom API endpoint |

## How the LLM uses it

The recommended system prompt addition:

```
You have access to SkillMesh via MCP tools.

Before any complex task:
1. Call resolve_skill with a short action description of what you need to do.
2. If found (found:true): use the promptTemplate, filling {{variables}} from context.
   If ragContext is present: prepend those chunks to your prompt.
3. If not found (found:false): handle the task yourself.
4. After a no-match task: call skill_offer_extraction to draft a reusable skill.
```

## Pro plan — RAG context

On Pro, `resolve_skill` also returns `ragContext`: relevant text chunks from files, scripts, and documents attached to the matched skill. Use them to ground your response:

```
[RAG context from "api-spec.yaml"]:
POST /users: Creates a new user...

[Your prompt template]:
Generate API documentation for: {{endpoint}}
```

## Tools reference

### `resolve_skill`

```json
{ "query": "summarize a support ticket" }
```

Returns:
```json
{
  "found": true,
  "skillName": "Summarize Support Ticket",
  "promptTemplate": "Summarize this ticket in {{language}}:\n\n{{ticket}}",
  "score": 0.91,
  "ragContext": [{ "fileName": "ticket-format.md", "content": "...", "score": 0.88 }],
  "message": "Found skill... fill {{variables}}..."
}
```

### `list_skills`

```json
{ "visibility": "private" }
```

### `skill_submit`

```json
{
  "name": "summarize-support-ticket",
  "description": "Summarizes a support ticket into key points",
  "promptTemplate": "Summarize this ticket in {{language}}:\n\n{{ticket}}",
  "triggers": ["summarize ticket", "support summary", "ticket tl;dr"],
  "tags": ["support", "summarization"],
  "toolsRequired": [],
  "tokenEstimate": 350,
  "visibility": "private"
}
```

### `skill_offer_extraction`

```json
{
  "taskDescription": "summarize a support ticket",
  "conversationSummary": "Extracted key issue, steps to reproduce, and resolution from the ticket text.",
  "tokensUsed": 340
}
```

Returns a `draft` you can pass directly to `skill_submit`.

## License

MIT
