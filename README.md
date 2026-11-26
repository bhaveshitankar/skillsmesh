# RaxTeam

**The AI platform for teams.** Build, share, and orchestrate AI prompt skills — from single prompts to fully autonomous supervised systems. Runs entirely on Cloudflare's global edge.

> Live at [raxteam.com](https://raxteam.com) · API at [api.raxteam.com](https://api.raxteam.com)

---

## What Is RaxTeam?

RaxTeam lets your team treat AI prompts as reusable, versioned, team-owned assets instead of one-off copy-paste. You write a prompt once, give it triggers and tags, and anyone in the org can resolve it by intent — no copying, no drift, no hallucination about which prompt is "current".

From there, the three-tier architecture lets you chain prompts into orchestrators and wrap them in supervisors that route, validate, and standardise responses. The end result is a full AI system deployed as a chat widget you can embed anywhere.

```
Skills  →  Orchestrators  →  Supervisors  →  Chat Endpoints
  ↑               ↑                ↑                ↑
prompt blocks   chain skills    route + validate  deploy anywhere
```

---

## Core Features

### Skills — Reusable AI Prompt Blocks

A **skill** is a prompt template with metadata that makes it discoverable and shareable:

- **Name + description** — what it does in plain English
- **Prompt template** — the actual prompt with `{{variable}}` placeholders
- **Triggers** — phrases that match this skill during intent resolution (e.g. `"summarize pr"`, `"pr summary"`)
- **Tags** — categorical labels for filtering (e.g. `"github"`, `"support"`)
- **Visibility** — `private` (org-only) or `public` (discoverable by all)

Skills go through a review lifecycle: **draft → submitted → approved** (or rejected back to draft). Only approved skills are returned by the resolver.

**Free:** up to 25 private skills. **Pro:** unlimited.

---

### Skill Resolver — Intent-Based Discovery

The resolver answers "which skill should handle this query?" using semantic vector search:

```bash
POST /resolve
{ "query": "how do I summarize a pull request?" }
```

Returns the best-matching approved skill plus its filled prompt template — ready to send to an LLM. No keyword matching needed; it understands intent.

- **Free tier:** uses `bge-small-en-v1.5` (384-dim embeddings), 500 calls/month
- **Pro tier:** uses `bge-base-en-v1.5` (768-dim embeddings), unlimited calls

Skills are re-embedded in a background queue worker whenever they're updated, keeping the vector index fresh without blocking API responses.

---

### Skill Builder — Auto-Generate Skills from Documents (Pro)

Upload a document or paste a URL and the Skill Builder reads it, extracts the key knowledge, and proposes 3 reusable AI skills you can review and save:

1. **Upload** — `.txt`, `.md`, `.csv`, `.html` up to 5 MB, or paste a public URL
2. **Generate** — LLM (Llama 3.3 70B) analyzes the content and returns skill definitions
3. **Review** — accept or discard each suggested skill before saving

You can provide a `topicFocus` to narrow what kinds of skills get generated (e.g. `"customer support"`, `"code review"`).

**Limit:** 10 Skill Builder jobs per org per day.

---

### Orchestrator Builder — Chain Skills into Workflows (Pro)

An **orchestrator** is a visual workflow that chains skills together to achieve a goal. Instead of calling one skill in isolation, an orchestrator can:

- Classify the intent of an incoming request
- Branch into different skill paths based on conditions
- Call external APIs via MCP tool nodes
- Embed sub-workflows as steps
- Produce a structured final output

**Orchestrator Builder** automates the design step: give it a list of skills and a plain-English goal, and the AI designs the node graph for you. You can then open it in the visual workflow editor to fine-tune.

**Node types:**
| Type | What it does |
|------|-------------|
| `input` | Entry point — receives the user request |
| `skill` | Runs a specific skill |
| `condition` | Branches based on a condition expression |
| `mcp_tool` | Calls an MCP server endpoint |
| `sub_workflow` | Embeds another orchestrator or supervisor |
| `output` | Collects the final result |

---

### Supervisor Builder — Route, Validate, Standardise (Pro)

A **supervisor** sits above multiple orchestrators. It is responsible for:

1. **Classifying** — understanding what the user is asking for
2. **Routing** — sending the request to the right orchestrator
3. **Validating** — checking that the orchestrator's output meets quality criteria
4. **Standardising** — formatting the response in a consistent structure

Supervisors are the top-level AI layer that users interact with via chat endpoints. They make the system robust: even if a request is ambiguous, the supervisor figures out who should handle it.

**Supervisor Builder** takes a list of orchestrators and a description, and designs the routing + validation workflow automatically.

---

### Visual Workflow Editor (Pro)

Every orchestrator and supervisor can be opened in a full **React Flow** canvas:

- Drag-and-drop nodes
- Connect edges to define execution order
- Edit node configuration inline (skill selection, condition expressions, MCP endpoints)
- Reference secrets from the Secrets Manager via `{{secret:MY_KEY}}` in node configs
- Publish to make the workflow runnable

Workflows are versioned — each publish creates a snapshot stored in `workflow_versions`.

---

### Secrets Manager — Encrypted Credential Store (Pro)

Store API keys, tokens, and other credentials **AES-GCM-256 encrypted** in D1. Values are never returned by the API — only metadata (name, scope, created date).

Reference secrets in workflow MCP node headers:
```
Authorization: Bearer {{secret:OPENAI_API_KEY}}
```

Resolved at runtime when the workflow executes — the plaintext never touches your application code.

**Scopes:** `org` (shared across the team) or `user` (personal to the creator).

---

### Chat Endpoints — Deploy Chat Anywhere (Pro)

A **chat endpoint** is a standalone widget backed by a specific supervisor. Multiple endpoints per org for different audiences:

| Endpoint | Backed by | Audience |
|----------|-----------|----------|
| Customer Support Chat | Support Supervisor | External users |
| Dev Team Bot | Engineering Supervisor | Internal engineers |
| Sales Assistant | Sales Supervisor | Sales team |

Each endpoint gets:
- A unique **token** (rotate anytime without recreating the endpoint)
- A **widget URL** — full-page hosted chat at `raxteam.com/chat/e/:token`
- An **embed code** — one `<script>` tag to drop into any webpage

Configurable per-endpoint: chat title, bot name, welcome message, accent color, allowed origins.

```html
<script src="https://api.raxteam.com/widget.js"
        data-token="YOUR_ENDPOINT_TOKEN" defer></script>
```

---

### Org-Wide Chat (Pro)

Beyond per-supervisor endpoints, each org has a shared chat available to all team members. Backed by the org's default AI config (system prompt, provider, model). Good for internal Q&A over the org's skills.

---

### AI Playground (Free + Pro)

A zero-friction way to test prompts against Cloudflare AI:

- **Free:** 5 runs/day
- **Pro:** 50 runs/day

No API keys needed — uses the org's Cloudflare AI binding.

---

### MCP Integration

RaxTeam exposes an MCP server (`skillmesh-mcp`) so AI coding tools (Claude Code, Cursor, Windsurf) can access your org's skills as tools. This means your AI assistant can resolve and use your team's prompt library without you copy-pasting anything.

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

### Team Management

- Invite members via email with role-based access: `admin` or `member`
- Admins can manage skills, workflows, secrets, and billing
- Members can create and use skills but cannot delete org resources
- **Free:** up to 5 members · **Pro:** unlimited

---

### Plans and Billing

| Feature | Free | Pro |
|---------|------|-----|
| Private skills | 25 | Unlimited |
| Team members | 5 | Unlimited |
| Resolver calls/month | 500 | Unlimited |
| Embedding quality | 384-dim | 768-dim |
| Workflows | — | ✓ |
| Skill Builder | — | ✓ (10/day) |
| Orchestrator Builder | — | ✓ |
| Supervisor Builder | — | ✓ |
| Secrets Manager | — | ✓ |
| Chat Endpoints | — | ✓ |
| AI Chat | — | ✓ |

**Free trial:** 15 days of Pro, no credit card required. One trial per org.

Paid plans use Razorpay (`pro_monthly` ₹2,999/mo or `pro_annual` ₹23,999/yr).

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Cloudflare                       │
│                                                      │
│  ┌──────────────────┐    ┌─────────────────────┐    │
│  │   API Worker     │───▶│   D1 (SQLite)       │    │
│  │   Hono.js        │    │   12 migrations     │    │
│  │   api.raxteam.com│    └─────────────────────┘    │
│  └──────┬───────────┘                               │
│         │                                            │
│         ├──▶ KV        — rate limits, job cache      │
│         ├──▶ Vectorize — skills-384 + skills-768     │
│         ├──▶ Workers AI — LLM + embeddings           │
│         └──▶ Queue     — async batch embedding       │
│                                                      │
│  ┌──────────────────┐                               │
│  │  Queue Worker    │──▶ Vectorize (re-embedding)   │
│  └──────────────────┘                               │
│                                                      │
│  ┌──────────────────┐                               │
│  │  Dashboard       │ ← Cloudflare Pages            │
│  │  React + Vite    │   raxteam.com                 │
│  └──────────────────┘                               │
└─────────────────────────────────────────────────────┘
```

**Stack:**
- API — Cloudflare Workers + [Hono](https://hono.dev)
- Database — Cloudflare D1 (SQLite) + [Drizzle ORM](https://orm.drizzle.team)
- Vector search — Cloudflare Vectorize
- AI — Cloudflare Workers AI (Llama 3.3 70B, BGE embeddings)
- Queue — Cloudflare Queues
- Cache — Cloudflare KV
- Dashboard — React 18 + Vite + Tailwind CSS + React Flow
- Auth — GitHub OAuth (+ Google OAuth)
- Payments — Razorpay
- Observability — New Relic (logs + metrics)
- Monorepo — Turborepo (`apps/api`, `apps/dashboard`, `packages/db`)

---

## Quickstart

See [SETUP.md](SETUP.md) for full deployment instructions.

```bash
# 1. Install
npm install

# 2. Create D1 database and run migrations
npx wrangler d1 create skillmesh-db
cd packages/db && npm run migrate:remote

# 3. Set secrets
cd apps/api
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET

# 4. Deploy
cd apps/api && npx wrangler deploy
cd apps/dashboard && npm run build && npx wrangler pages deploy dist
```

Import `docs/skillmesh.postman_collection.json` to explore the API.

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/me` | Current user + org |
| GET | `/skills` | List skills |
| POST | `/skills` | Create skill |
| POST | `/skills/:id/submit` | Submit for review |
| POST | `/skills/:id/approve` | Approve skill |
| POST | `/resolve` | Intent-based skill lookup |
| GET | `/workflows` | List workflows |
| POST | `/workflows` | Create workflow |
| POST | `/workflows/:id/publish` | Publish workflow |
| POST | `/workflows/:id/run` | Run workflow |
| POST | `/skill-builder/upload` | Upload document |
| POST | `/skill-builder/url` | Fetch from URL |
| POST | `/skill-builder/generate` | Generate skill suggestions |
| POST | `/skill-builder/create` | Save skills |
| POST | `/skill-builder/orchestrator` | AI-build orchestrator |
| POST | `/skill-builder/supervisor` | AI-build supervisor |
| GET | `/secrets` | List secrets (metadata only) |
| POST | `/secrets` | Store encrypted secret |
| GET | `/chat-endpoints` | List chat endpoints |
| POST | `/chat-endpoints` | Create chat endpoint |
| PATCH | `/chat-endpoints/:id` | Update / rotate token |
| POST | `/billing/start-trial` | Activate 15-day trial |
| POST | `/billing/order` | Create Razorpay order |
| GET | `/public/endpoint/:token/config` | Public widget config |

Full Postman collection: [`docs/skillmesh.postman_collection.json`](docs/skillmesh.postman_collection.json)

---

## Dashboard Pages

| Page | Route | Plan |
|------|-------|------|
| Skills library | `/skills` | Free |
| Skill detail + review | `/skills/:id` | Free |
| Create skill | `/skills/new` | Free |
| AI Playground | `/playground` | Free |
| Intent resolver | `/resolve` | Free |
| Team members | `/members` | Free |
| Profile + API key | `/profile` | Free |
| Upgrade / trial | `/upgrade` | Free |
| Skill Builder | `/skill-builder` | Pro |
| Orchestrator Builder | `/orchestrator-builder` | Pro |
| Supervisor Builder | `/supervisor-builder` | Pro |
| Workflows (visual editor) | `/workflows`, `/workflows/:id` | Pro |
| Secrets Manager | `/secrets` | Pro |
| Chat Endpoints | `/chat-endpoints` | Pro |
| Org AI Chat | `/chat` | Pro |
| Chat Config | `/settings/chat` | Pro |

---

## Local Development

```bash
# API (localhost:8787)
cd apps/api && npx wrangler dev

# Dashboard (localhost:5173)
cd apps/dashboard && npm run dev
```

Set `VITE_API_URL=http://localhost:8787` in `apps/dashboard/.env.local` to point the dashboard at the local API.

---

## License

Proprietary — RaxTeam / SkillMesh. All rights reserved.
