# RaxTeam — Setup & Feature Guide

Complete guide for deploying and using RaxTeam on Cloudflare. No credit card required for the free tier.

---

## What Is RaxTeam?

RaxTeam (SkillMesh) is a multi-tenant AI platform where teams can create, share, and orchestrate AI prompt skills. The three-tier architecture lets you build from simple prompt blocks up to fully autonomous supervised AI systems:

```
Skills  →  Orchestrators  →  Supervisors  →  Chat Endpoints
  ↑               ↑                ↑                ↑
prompt blocks   chain skills    route + validate  deploy anywhere
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  Cloudflare                      │
│                                                  │
│  ┌──────────────┐    ┌─────────────────────┐    │
│  │  API Worker  │───▶│   D1 (SQLite)       │    │
│  │  (Hono.js)   │    │   21 tables         │    │
│  └──────┬───────┘    └─────────────────────┘    │
│         │                                        │
│         ├──▶ KV (rate limits, job cache)         │
│         ├──▶ Vectorize (skills-384 / skills-768) │
│         ├──▶ Workers AI (LLM + embeddings)       │
│         └──▶ Queue (async batch embedding)       │
│                                                  │
│  ┌──────────────┐                               │
│  │ Queue Worker │──▶ Vectorize                  │
│  └──────────────┘                               │
└─────────────────────────────────────────────────┘
```

---

## Prerequisites

- Node.js 18+
- Cloudflare account (free tier)
- GitHub account (for OAuth)

```bash
npm install -g wrangler
npx wrangler login
```

---

## 1. Install Dependencies

```bash
cd /path/to/skillmesh
npm install
```

---

## 2. Create D1 Database

```bash
npx wrangler d1 create skillmesh-db
```

Copy the `database_id` into `apps/api/wrangler.toml` → `[[d1_databases]] database_id`.

---

## 3. Run Migrations

```bash
cd packages/db && npm run migrate:remote
```

Current migration files (run in order):
| File | What it creates |
|------|----------------|
| 0000_motionless_toad.sql | orgs, users, skills, invites |
| 0001_invites.sql | invite tokens |
| 0002_skill_assets.sql | skill file attachments |
| 0003_stripe.sql | stripe fields on orgs |
| 0004_votes_donations.sql | upvotes/downvotes |
| 0005_google_auth.sql | Google OAuth fields |
| 0006_skill_evals.sql | skill evaluations |
| 0007_share_tokens.sql | skill share links |
| 0008_performance_indexes.sql | query indexes |
| 0009_workflows.sql | workflows, workflow_versions, workflow_runs |
| 0010_secrets_trial.sql | org_secrets, trialEndsAt on orgs |
| 0011_chat_endpoints.sql | chat_endpoints (per-supervisor widget) |

---

## 4. Create KV Namespace

```bash
npx wrangler kv namespace create skillmesh-kv
```

Update `apps/api/wrangler.toml` → `[[kv_namespaces]] id`.

---

## 5. Create Vectorize Indexes

```bash
npx wrangler vectorize create skills-384 --dimensions=384 --metric=cosine
npx wrangler vectorize create skills-768 --dimensions=768 --metric=cosine
```

---

## 6. Create Queue

```bash
npx wrangler queues create skillmesh-embed-batch
```

---

## 7. GitHub OAuth App

Go to github.com/settings/developers → **New OAuth App**:

| Field | Value |
|-------|-------|
| Homepage URL | `https://api.raxteam.com` |
| Callback URL | `https://api.raxteam.com/auth/github/callback` |

```bash
cd apps/api
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET      # any random 32-char string
npx wrangler secret put NR_LICENSE_KEY      # New Relic license key (optional)
```

---

## 8. Deploy

```bash
cd apps/api && npx wrangler deploy
cd apps/queues && npx wrangler deploy
cd apps/dashboard && npm run build && npx wrangler pages deploy dist --project-name skillmesh-dashboard
```

---

## 9. Smoke Test

```bash
curl https://api.raxteam.com/health
# {"ok":true}
```

---

## 10. API Key

Sign in via GitHub to get your `sk-xxxx` API key:
```
https://api.raxteam.com/auth/github
```

Then test:
```bash
curl -H "Authorization: Bearer sk-xxxx" https://api.raxteam.com/me
```

---

## 11. Postman

Import `docs/skillmesh.postman_collection.json`. Set variables:
- `base_url` → `https://api.raxteam.com`
- `token` → your `sk-xxxx`

**Suggested run order for full flow:**
1. Health Check → Me
2. Create Skill → Submit → Approve
3. Resolve Skill
4. Start Free Trial (if on free plan)
5. Skill Builder: Upload → Generate → Create Skills
6. Build Orchestrator → Build Supervisor
7. Publish Workflow
8. Create Chat Endpoint
9. Run Workflow

---

## Feature Reference

### Plan Tiers

| Feature | Free | Pro (trial or paid) |
|---------|------|---------------------|
| Private skills | 25 | Unlimited |
| Team members | 5 | Unlimited |
| Resolver calls/month | 500 | Unlimited |
| Embedding model | bge-small-en (384-dim) | bge-base-en (768-dim) |
| Workflows | — | ✓ |
| Skill Builder | — | ✓ (10 jobs/day) |
| Orchestrator Builder | — | ✓ |
| Supervisor Builder | — | ✓ |
| Secrets Manager | — | ✓ |
| Chat Endpoints | — | ✓ |
| AI Chat (org widget) | — | ✓ |
| New Relic monitoring | — | super-admin only |

### Free Trial

Orgs can activate a **15-day Pro trial** from the Upgrade page or via API:

```bash
curl -X POST https://api.raxteam.com/billing/start-trial \
  -H "Authorization: Bearer sk-xxxx"
# {"ok":true,"trialEndsAt":1234567890000}
```

One trial per org. No credit card required.

---

## Building AI Systems — The Three-Tier Architecture

### Tier 1: Skills (Prompt Blocks)

Skills are reusable AI prompt templates with triggers and tags. Create manually or use Skill Builder to auto-generate from documents.

**API:** `POST /skills`, `GET /skills`, `POST /skill-builder/generate`

### Tier 2: Orchestrators (Skill Chains)

Orchestrators chain skills together using a visual node editor. Node types:
- **input** — entry point
- **skill** — runs a skill
- **condition** — branches on output
- **mcp_tool** — calls an MCP server
- **sub_workflow** — embeds another workflow
- **output** — final result

**API:** `POST /skill-builder/orchestrator`, `POST /workflows`, `POST /workflows/:id/run`

Reference secrets in MCP headers with `{{secret:MY_KEY}}` — resolved at runtime from the Secrets Manager.

### Tier 3: Supervisors (Router + Validator)

Supervisors sit above orchestrators. They:
1. Classify the incoming request
2. Route to the correct orchestrator
3. Validate the output
4. Standardise the response format

**API:** `POST /skill-builder/supervisor`

---

## Chat Endpoints

Each chat endpoint is a standalone widget backed by a supervisor. Multiple endpoints per org for different audiences.

```bash
# Create a chat endpoint linked to a supervisor
curl -X POST https://api.raxteam.com/chat-endpoints \
  -H "Authorization: Bearer sk-xxxx" \
  -H "Content-Type: application/json" \
  -d '{"name": "Customer Support", "workflowId": "wf-xxx"}'
```

Returns a token used in the embed code:
```html
<script src="https://api.raxteam.com/widget.js"
        data-token="YOUR_ENDPOINT_TOKEN" defer></script>
```

Public config endpoint (no auth):
```
GET https://api.raxteam.com/public/endpoint/:token/config
```

---

## Secrets Manager

Store credentials encrypted (AES-GCM-256) and reference them in workflow nodes:

```bash
# Store a secret
curl -X POST https://api.raxteam.com/secrets \
  -H "Authorization: Bearer sk-xxxx" \
  -H "Content-Type: application/json" \
  -d '{"name": "OPENAI_API_KEY", "value": "sk-...", "scope": "org"}'
```

Use in workflow MCP node headers:
```json
{ "Authorization": "Bearer {{secret:OPENAI_API_KEY}}" }
```

---

## MCP Integration (Claude Code / Cursor)

```json
{
  "mcpServers": {
    "skillmesh": {
      "command": "npx",
      "args": ["skillmesh-mcp"],
      "env": {
        "SKILLMESH_API_KEY": "sk-xxxx",
        "SKILLMESH_API_URL": "https://api.raxteam.com"
      }
    }
  }
}
```

---

## Observability (New Relic)

Logs and metrics are sent to New Relic via fire-and-forget (super-admin only config):

```bash
cd apps/api
npx wrangler secret put NR_LICENSE_KEY   # from New Relic account settings
# Set NR_REGION = "EU" in wrangler.toml [vars] for EU data center
```

Key metrics: `skillmesh.chat.messages`, `skillmesh.resolve.calls`

---

## Dashboard Pages

| Page | URL | Description |
|------|-----|-------------|
| Skills | `/skills` | List, filter, create skills |
| Skill Builder | `/skill-builder` | Upload docs → auto-generate skills (Pro) |
| Orchestrator Builder | `/orchestrator-builder` | Select skills + goal → AI builds orchestrator (Pro) |
| Supervisor Builder | `/supervisor-builder` | Select orchestrators → AI builds supervisor (Pro) |
| Workflows | `/workflows` | Visual node editor for all workflow types |
| Secrets | `/secrets` | Manage encrypted credentials (Pro) |
| Chat Endpoints | `/chat-endpoints` | Per-supervisor chat widgets (Pro) |
| Chat | `/chat` | Org-wide AI chat (Pro) |
| Playground | `/playground` | Free-tier AI prompt testing |
| Resolve | `/resolve` | Vector-search skill lookup |
| Upgrade | `/upgrade` | Plans + 15-day free trial activation |
| Members | `/members` | Team management |
| Integration | `/integration` | API keys, MCP setup |

---

## Local Development

```bash
cd apps/api && npx wrangler dev    # API on localhost:8787
cd apps/dashboard && npm run dev   # Dashboard on localhost:5173
```
