-- Seed: 25 community skills for RaxTeam
-- Org: Anonymous Submissions (51152a3d-f1cd-4a63-97a4-e04f97783354)
-- Author: anon@raxteam.internal (b105ada5-1ec8-4934-9e09-0fe06ab4cf99)

INSERT OR IGNORE INTO skills (id, org_id, author_id, name, slug, version, description, prompt_template, tools_required, triggers, tags, visibility, status, token_estimate, avg_token_savings, use_count, upvotes, downvotes, created_at, published_at) VALUES

('seed-001', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Code Review Assistant',
'code-review-assistant-seed-001', '1.0.0',
'Reviews code for bugs, security issues, and best practices. Provides structured feedback with severity levels.',
'You are a senior software engineer conducting a thorough code review. Analyze the following {{language}} code and provide structured feedback.

**Code to review:**
```{{language}}
{{code}}
```

Review for:
1. **Bugs & Logic errors** — correctness issues, edge cases, off-by-one errors
2. **Security** — injection risks, auth issues, data exposure, unsafe inputs
3. **Performance** — O(n) complexity, unnecessary allocations, N+1 queries
4. **Readability** — naming, structure, comments where needed
5. **Best practices** — idiomatic patterns for {{language}}

For each issue found, specify:
- Severity: Critical / High / Medium / Low
- Line reference (if applicable)
- Explanation of the problem
- Suggested fix

End with a summary verdict: Approve / Request Changes / Needs Major Rework.',
'[]', '["review code", "code review", "check my code", "review this"]', '["engineering", "code-quality", "security", "review"]',
'public', 'approved', 280, 0, 0, 12, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-002', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Git Commit Message Generator',
'git-commit-message-generator-seed-002', '1.0.0',
'Generates conventional commit messages from a diff or description of changes.',
'Generate a git commit message following the Conventional Commits specification.

**Changes made:**
{{diff_or_description}}

Rules:
- Format: `<type>(<scope>): <short summary>` (max 72 chars)
- Types: feat, fix, docs, style, refactor, perf, test, chore, ci, build
- Scope: optional, lowercase, describes the module/area changed
- Summary: imperative mood, no capital first letter, no period at end
- Body (if needed): explain WHAT and WHY, not HOW — wrap at 72 chars
- Breaking changes: add `BREAKING CHANGE:` footer with migration notes

Output only the commit message, nothing else.',
'[]', '["write commit message", "commit message", "git commit", "conventional commit"]', '["git", "engineering", "developer-tools"]',
'public', 'approved', 160, 0, 0, 18, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-003', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Bug Report Formatter',
'bug-report-formatter-seed-003', '1.0.0',
'Transforms a raw bug description into a structured, actionable bug report.',
'Format the following into a well-structured bug report.

**Raw description:**
{{raw_description}}

Output a bug report with these sections:

**Title:** One-line summary (≤80 chars)

**Environment:**
- OS / Browser / Platform: (infer or ask if unknown)
- Version: (infer or mark as unknown)

**Steps to Reproduce:**
1. (numbered, specific, reproducible)

**Expected Behavior:**
What should happen

**Actual Behavior:**
What actually happens (include error messages verbatim if provided)

**Impact:** Critical / High / Medium / Low — explain why

**Possible Cause:** (if inferable from the description)

**Attachments needed:** List any logs, screenshots, or traces that would help',
'[]', '["file bug report", "write bug report", "report a bug", "bug template"]', '["engineering", "qa", "bug-tracking", "documentation"]',
'public', 'approved', 210, 0, 0, 8, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-004', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'SQL Query Optimizer',
'sql-query-optimizer-seed-004', '1.0.0',
'Analyzes SQL queries and suggests optimizations for performance.',
'You are a database performance expert. Analyze this SQL query and optimize it.

**Database:** {{database}} (PostgreSQL / MySQL / SQLite / etc.)

**Query:**
```sql
{{query}}
```

**Schema context (if provided):**
{{schema_context}}

Provide:
1. **Issues identified** — missing indexes, full table scans, inefficient joins, N+1 patterns, redundant subqueries
2. **Optimized query** — rewritten SQL with comments explaining changes
3. **Indexes to add** — exact CREATE INDEX statements
4. **Estimated improvement** — rough gain if measurable
5. **Caveats** — any trade-offs or cases where optimization may not apply',
'[]', '["optimize sql", "slow query", "sql performance", "query optimization"]', '["database", "sql", "performance", "engineering"]',
'public', 'approved', 240, 0, 0, 14, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-005', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Pull Request Description Writer',
'pull-request-description-writer-seed-005', '1.0.0',
'Writes clear, structured PR descriptions from a summary of changes.',
'Write a professional pull request description for the following changes.

**Summary of changes:**
{{changes_summary}}

**Ticket/Issue reference (if any):** {{ticket}}

Output the PR description in this format:

## What
Brief explanation of what changed and why (2-3 sentences).

## Changes
- Bullet list of specific changes made
- Keep each bullet to one logical change

## Testing
- [ ] Unit tests added/updated
- [ ] Manual testing steps
- [ ] Edge cases considered: {{edge_cases}}

## Screenshots
(if UI changes — note what to include)

## Notes for reviewer
Any context, trade-offs, or areas to pay special attention to.',
'[]', '["write PR description", "pull request", "PR template", "describe changes"]', '["engineering", "git", "collaboration", "documentation"]',
'public', 'approved', 220, 0, 0, 16, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-006', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Technical RFC Writer',
'technical-rfc-writer-seed-006', '1.0.0',
'Creates a structured technical RFC/design document from a feature idea.',
'Write a technical RFC (Request for Comments) document for the following proposal.

**Feature/Change:** {{feature_name}}
**Problem being solved:** {{problem}}
**Proposed solution:** {{solution}}
**Author:** {{author}}

Structure the RFC as:

# RFC: {{feature_name}}

**Status:** Draft | **Date:** (today) | **Author:** {{author}}

## Summary
One paragraph overview of the proposal.

## Motivation
Why this change is needed. What problem does it solve? What is the impact of not doing it?

## Detailed Design
Technical specification. Be precise about interfaces, data structures, algorithms, and protocols.

## Drawbacks
Honest assessment of downsides, complexity, or risks.

## Alternatives Considered
Other approaches evaluated and why they were rejected.

## Unresolved Questions
Open questions that need input before this RFC can be accepted.',
'[]', '["write RFC", "design document", "technical proposal", "architecture doc"]', '["engineering", "documentation", "architecture", "planning"]',
'public', 'approved', 300, 0, 0, 9, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-007', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Support Ticket Summarizer',
'support-ticket-summarizer-seed-007', '1.0.0',
'Summarizes a customer support ticket into a concise brief for engineers or managers.',
'Summarize the following customer support ticket into a concise engineering brief.

**Ticket content:**
{{ticket_content}}

Output:

**One-line summary:** (≤100 chars, problem + product area)

**Customer impact:** Critical (data loss/outage) | High (blocking workflow) | Medium (degraded UX) | Low (cosmetic)

**Root cause (if determinable):** Brief technical explanation or "Unknown — needs investigation"

**Affected users:** Estimate if mentioned; otherwise note it''s unclear

**Steps to reproduce:**
1. (if inferable from ticket)

**Environment:** OS, browser, version if mentioned

**Suggested owner:** (frontend / backend / infra / billing / unknown)

**Action needed:** (Investigate / Fix / Document / Escalate / Close as won''t fix)',
'[]', '["summarize ticket", "support ticket", "triage ticket", "customer issue"]', '["support", "customer-success", "engineering", "triage"]',
'public', 'approved', 230, 0, 0, 11, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-008', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'API Documentation Generator',
'api-documentation-generator-seed-008', '1.0.0',
'Generates clean API reference documentation from endpoint descriptions or code.',
'Generate API reference documentation for the following endpoint.

**Endpoint details:**
{{endpoint_details}}

Output in this format:

### `{{method}} {{path}}`

**Description:** What this endpoint does in one sentence.

**Authentication:** Required | Optional | None — specify type

**Request**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| (fill in) | | | |

**Request body example:**
```json
{
  (example)
}
```

**Response (200 OK)**
```json
{
  (example with field descriptions as comments)
}
```

**Error responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | VALIDATION_ERROR | |
| 401 | UNAUTHORIZED | |
| 404 | NOT_FOUND | |

**Example cURL:**
```bash
curl -X {{method}} ...
```',
'[]', '["document API", "API docs", "write documentation", "endpoint documentation"]', '["engineering", "documentation", "api", "developer-tools"]',
'public', 'approved', 270, 0, 0, 13, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-009', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Incident Postmortem Writer',
'incident-postmortem-writer-seed-009', '1.0.0',
'Writes a blameless incident postmortem document from a raw incident description.',
'Write a blameless incident postmortem document from the following incident details.

**Incident summary:** {{summary}}
**Duration:** {{duration}}
**Severity:** {{severity}}
**Systems affected:** {{systems}}
**Timeline notes:** {{timeline_notes}}

Output:

# Postmortem: {{summary}}

**Date:** (incident date) | **Severity:** {{severity}} | **Duration:** {{duration}}
**Status:** Draft

## Summary
2-3 sentence overview of what happened and its customer impact.

## Timeline
| Time | Event |
|------|-------|
(reconstruct from notes, use UTC)

## Root Cause
Technical explanation of what failed and why. Be specific — name the component, the failure mode, and the triggering condition.

## Contributing Factors
Systemic issues that made this incident possible or worse.

## Impact
- Users affected: (estimate)
- Data impact: (if any)
- SLA breach: Yes / No

## What Went Well
Things that helped limit impact or speed recovery.

## Action Items
| Item | Owner | Due |
|------|-------|-----|
(specific, trackable — no vague items)',
'[]', '["write postmortem", "incident postmortem", "post-incident", "RCA"]', '["engineering", "reliability", "sre", "documentation"]',
'public', 'approved', 310, 0, 0, 10, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-010', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Unit Test Generator',
'unit-test-generator-seed-010', '1.0.0',
'Generates comprehensive unit tests for a given function or class.',
'Generate comprehensive unit tests for the following code.

**Framework:** {{test_framework}} (Jest / pytest / Go test / JUnit / etc.)
**Language:** {{language}}

**Code to test:**
```{{language}}
{{code}}
```

Write tests that cover:
1. **Happy path** — expected inputs produce expected outputs
2. **Edge cases** — empty inputs, nulls, zeros, max values, empty arrays
3. **Error cases** — invalid inputs, exceptions that should be thrown
4. **Boundary conditions** — off-by-one, type coercion, precision issues

For each test:
- Use descriptive test names: `it("should return X when Y")` style
- Arrange / Act / Assert structure
- Mock external dependencies (specify what to mock and why)
- Aim for 100% branch coverage of the provided code

Output only the test file — no explanations unless a non-obvious choice needs a comment.',
'[]', '["write unit tests", "generate tests", "test this function", "add tests"]', '["engineering", "testing", "qa", "developer-tools"]',
'public', 'approved', 260, 0, 0, 19, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-011', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Sprint Planning Story Writer',
'sprint-planning-story-writer-seed-011', '1.0.0',
'Converts a feature idea into well-structured user stories with acceptance criteria.',
'Convert the following feature idea into user stories with acceptance criteria.

**Feature idea:** {{feature_idea}}
**User personas involved:** {{personas}}

For each story, use the format:

---
**Story:** As a {{persona}}, I want to {{action}} so that {{benefit}}.

**Acceptance Criteria:**
- Given {{context}}, when {{action}}, then {{outcome}}
- (add 3-6 criteria covering happy path and key edge cases)

**Out of scope for this story:**
- (what explicitly NOT to build)

**Story points estimate:** (XS=1, S=2, M=3, L=5, XL=8) — provide rough estimate with one-line rationale

**Dependencies:** (other stories or systems this depends on)

---

Break large features into multiple focused stories. Each story should be completable in 1-3 days.',
'[]', '["write user stories", "sprint planning", "acceptance criteria", "agile stories"]', '["product", "agile", "planning", "documentation"]',
'public', 'approved', 240, 0, 0, 7, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-012', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'README Generator',
'readme-generator-seed-012', '1.0.0',
'Generates a professional README.md for a software project.',
'Generate a professional README.md for the following project.

**Project name:** {{project_name}}
**What it does:** {{description}}
**Tech stack:** {{tech_stack}}
**Target audience:** {{audience}}

Output a complete README.md with:

# {{project_name}}

> One-line tagline

Brief 2-3 sentence description of what it does and why it exists.

## Features
- Key feature bullets (focus on user value, not implementation details)

## Quick Start
Minimal steps to get it running in under 2 minutes.

```bash
# install, configure, run commands
```

## Installation
Full installation instructions including prerequisites.

## Configuration
Environment variables / config options as a table:
| Variable | Required | Default | Description |

## Usage
Most common use case with a working example.

## API Reference
(if applicable — link to separate docs or inline key endpoints)

## Contributing
How to set up dev environment and submit PRs.

## License
(infer from tech stack norms or ask)',
'[]', '["write README", "project documentation", "readme template", "document project"]', '["documentation", "open-source", "engineering", "developer-tools"]',
'public', 'approved', 290, 0, 0, 15, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-013', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Error Message Explainer',
'error-message-explainer-seed-013', '1.0.0',
'Explains cryptic error messages in plain English with actionable fix steps.',
'Explain the following error message and provide fix steps.

**Error:**
```
{{error_message}}
```

**Context (language/framework/what I was doing):** {{context}}

Explain:

**What this error means** (plain English, no jargon)

**Why it happened** (most likely cause given the context)

**How to fix it:**
1. (most likely fix — try this first)
2. (second option if the first doesn''t work)
3. (deeper investigation steps if needed)

**How to prevent it in the future:** (best practice or guard to add)

**Related errors to watch for:** (similar errors this might be confused with)',
'[]', '["explain error", "what does this error mean", "fix this error", "debug"]', '["debugging", "engineering", "developer-tools", "learning"]',
'public', 'approved', 190, 0, 0, 22, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-014', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Database Schema Designer',
'database-schema-designer-seed-014', '1.0.0',
'Designs a normalized database schema from a feature description.',
'Design a database schema for the following feature.

**Feature description:** {{feature_description}}
**Database:** {{database}} (PostgreSQL preferred unless specified)
**Scale expectation:** {{scale}} (e.g., "10k users", "1M records/day")

Output:

## Tables

For each table:
```sql
CREATE TABLE table_name (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- columns with types, constraints, and inline comments
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

## Indexes
```sql
CREATE INDEX ... -- with comment explaining why
```

## Relationships
Describe foreign keys and cardinality (1:1, 1:N, M:N).

## Design decisions
- Normalization choices made and why
- Any denormalization trade-offs for performance
- Partitioning strategy if scale warrants it
- Fields intentionally omitted and why',
'[]', '["design database schema", "database design", "create tables", "schema design"]', '["database", "engineering", "architecture", "sql"]',
'public', 'approved', 270, 0, 0, 11, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-015', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Meeting Notes Formatter',
'meeting-notes-formatter-seed-015', '1.0.0',
'Converts rough meeting notes into a clean, structured summary with action items.',
'Format the following rough meeting notes into a clean structured summary.

**Meeting type:** {{meeting_type}} (e.g., standup, sprint retro, design review)
**Date:** {{date}}
**Attendees:** {{attendees}}

**Raw notes:**
{{raw_notes}}

Output:

# Meeting Notes — {{meeting_type}}
**Date:** {{date}} | **Attendees:** {{attendees}}

## Summary
2-3 sentences covering the main purpose and outcome of the meeting.

## Decisions Made
- (only firm decisions, not discussions)

## Key Discussion Points
- (important context, debates, and conclusions — not every word)

## Action Items
| # | Action | Owner | Due |
|---|--------|-------|-----|
| 1 | | | |

## Parking Lot
Topics raised but deferred to a future meeting.

## Next Meeting
Date / agenda (if discussed)',
'[]', '["format meeting notes", "meeting summary", "action items", "standup notes"]', '["productivity", "documentation", "team", "collaboration"]',
'public', 'approved', 210, 0, 0, 9, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-016', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Regex Pattern Generator',
'regex-pattern-generator-seed-016', '1.0.0',
'Generates and explains regular expressions for a given matching requirement.',
'Generate a regular expression for the following requirement.

**What to match:** {{requirement}}
**Language/flavor:** {{language}} (JavaScript / Python / Go / PCRE / etc.)
**Examples of strings that SHOULD match:** {{match_examples}}
**Examples of strings that should NOT match:** {{no_match_examples}}

Output:

**Regex:**
```
/your-pattern/flags
```

**Explanation** (break down each part):
- `pattern-part` — what it matches and why

**Test cases:**
```
✓ matches: (list examples)
✗ rejects: (list examples)
```

**Usage example:**
```{{language}}
// How to use this regex in code
```

**Caveats:** Edge cases, performance notes, or Unicode considerations',
'[]', '["write regex", "regular expression", "pattern matching", "regex generator"]', '["engineering", "developer-tools", "text-processing"]',
'public', 'approved', 200, 0, 0, 13, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-017', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Changelog Writer',
'changelog-writer-seed-017', '1.0.0',
'Generates a user-facing changelog entry from a list of commits or changes.',
'Write a user-facing changelog entry for the following release.

**Version:** {{version}}
**Release date:** {{date}}
**Raw commits / changes:**
{{raw_changes}}

Format as Keep a Changelog (keepachangelog.com):

## [{{version}}] - {{date}}

### Added
- New features users will care about (not internal refactors)

### Changed
- Changes to existing behavior that users will notice

### Fixed
- Bug fixes described from the user''s perspective (not "fixed null pointer in UserService")

### Deprecated
- Features being phased out (include migration path)

### Removed
- Features that were removed

### Security
- Security fixes (be specific about what was patched without giving attack details)

Rules:
- Write for users, not engineers
- Each bullet: what changed and why it matters to them
- Skip internal-only changes (refactors, test additions, CI changes)
- Group related changes into single bullets where sensible',
'[]', '["write changelog", "release notes", "what changed", "version notes"]', '["engineering", "documentation", "release", "product"]',
'public', 'approved', 220, 0, 0, 8, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-018', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Dependency Audit Advisor',
'dependency-audit-advisor-seed-018', '1.0.0',
'Reviews a dependency list and flags risky, outdated, or redundant packages.',
'Review the following dependency list and identify issues.

**Package manager:** {{package_manager}} (npm / pip / go.mod / cargo / etc.)
**Dependencies:**
```
{{dependency_list}}
```

Analyze and report:

## Security Risks
List packages with known CVEs or suspicious histories (check your knowledge cutoff for known issues).

## Outdated Packages
Flag packages likely to be significantly behind — especially if they have had breaking changes in newer versions.

## Redundant / Overlapping Packages
Dependencies that duplicate functionality (e.g., two date libraries, two HTTP clients).

## Heavy / Unnecessary Packages
Large packages where a native alternative or lighter library exists.

## Recommendations
| Package | Issue | Recommended Action |
|---------|-------|-------------------|

## Upgrade Priority
Critical (security) > High (compatibility) > Medium (performance) > Low (nice-to-have)',
'[]', '["audit dependencies", "check packages", "npm audit", "review dependencies"]', '["engineering", "security", "devops", "maintenance"]',
'public', 'approved', 230, 0, 0, 6, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-019', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Onboarding Email Sequence Writer',
'onboarding-email-sequence-writer-seed-019', '1.0.0',
'Writes a multi-email onboarding sequence for a SaaS product.',
'Write an onboarding email sequence for the following product.

**Product:** {{product_name}}
**What it does:** {{product_description}}
**Target user:** {{user_persona}}
**Key actions to drive:** {{key_actions}}

Write {{num_emails}} emails in this sequence:

---
**Email {{n}}: {{goal}}**
Subject: (compelling, specific, ≤50 chars)
Send timing: Day X after signup

Body:
(150-250 words, first-person from a named founder/team member, conversational tone)
- Opening hook that references what they just did / where they are in the journey
- One clear value point or tip
- One specific call to action
- P.S. line with something helpful or human

---

Tone: Helpful, not pushy. Feel like advice from a knowledgeable friend, not marketing copy.',
'[]', '["write onboarding emails", "email sequence", "welcome email", "drip campaign"]', '["marketing", "product", "email", "growth"]',
'public', 'approved', 260, 0, 0, 5, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-020', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Job Description Writer',
'job-description-writer-seed-020', '1.0.0',
'Writes an inclusive, compelling job description that attracts strong candidates.',
'Write a job description for the following role.

**Role:** {{role_title}}
**Team:** {{team}}
**Level:** {{level}} (IC1–IC5 / Junior / Senior / Staff / Principal)
**Key responsibilities:** {{responsibilities}}
**Must-have requirements:** {{requirements}}
**Nice-to-have:** {{nice_to_have}}
**Company context:** {{company_context}}

Output:

# {{role_title}} — {{team}}

**About the role** (2-3 sentences on impact and what makes this role interesting)

## What you''ll do
- (5-7 bullets, specific outcomes not vague duties)
- Start each with a strong verb: Design, Build, Own, Lead, Drive, Improve

## What we''re looking for
(Separate required from preferred — keep required list short and honest)

**Required:**
- (3-5 true blockers only)

**Preferred:**
- (things that would help but aren''t gates)

## What we offer
- (compensation range if possible, benefits, work style)

Avoid gendered language, credential inflation ("10 years required"), and vague filler ("fast-paced environment").',
'[]', '["write job description", "job posting", "hiring", "job description template"]', '["hr", "hiring", "talent", "documentation"]',
'public', 'approved', 270, 0, 0, 7, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-021', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Kubernetes Manifest Generator',
'kubernetes-manifest-generator-seed-021', '1.0.0',
'Generates production-ready Kubernetes manifests for a service deployment.',
'Generate Kubernetes manifests for the following service.

**Service name:** {{service_name}}
**Image:** {{image}}
**Port:** {{port}}
**Replicas:** {{replicas}}
**Environment variables:** {{env_vars}}
**Resource requirements:** {{resources}} (e.g., "512Mi RAM, 250m CPU")
**Any special requirements:** {{special}}

Generate these manifests:

1. **Deployment** — with:
   - Resource limits and requests
   - Liveness and readiness probes
   - Rolling update strategy (max surge/unavailable)
   - Security context (non-root, read-only filesystem where possible)
   - Pod disruption budget

2. **Service** — ClusterIP (or LoadBalancer if externally exposed)

3. **HorizontalPodAutoscaler** — CPU-based, min/max replicas

4. **ConfigMap** — for non-secret env vars

5. **NetworkPolicy** — restrict ingress/egress to what''s needed

Add comments explaining non-obvious choices. Output valid YAML.',
'[]', '["kubernetes manifest", "k8s deployment", "kubernetes config", "k8s yaml"]', '["devops", "kubernetes", "infrastructure", "engineering"]',
'public', 'approved', 310, 0, 0, 10, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-022', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Data Migration Script Planner',
'data-migration-script-planner-seed-022', '1.0.0',
'Plans a safe database migration with rollback strategy and zero-downtime steps.',
'Plan a safe database migration for the following change.

**Migration goal:** {{migration_goal}}
**Current schema:** {{current_schema}}
**Target schema:** {{target_schema}}
**Database:** {{database}}
**Estimated rows affected:** {{row_count}}
**Downtime tolerance:** {{downtime}} (zero / < 1 min / maintenance window OK)

Output:

## Migration Plan: {{migration_goal}}

### Risk Assessment
- Data loss risk: None / Low / Medium / High
- Lock duration estimate: (ms/s/min)
- Rollback complexity: Simple / Moderate / Complex

### Pre-migration Checklist
- [ ] Backup verified
- [ ] Migration tested on staging
- [ ] Rollback script tested
- [ ] Monitoring alerts set

### Migration Steps
(numbered, each step independently safe to execute)

### Rollback Plan
Exact steps to revert if anything goes wrong.

### Verification Queries
```sql
-- Run after migration to verify correctness
```

### Post-migration Cleanup
Steps to remove temporary columns/tables after verification period.',
'[]', '["database migration", "migrate schema", "migration plan", "zero downtime migration"]', '["database", "engineering", "devops", "reliability"]',
'public', 'approved', 290, 0, 0, 8, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-023', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Customer Feedback Analyzer',
'customer-feedback-analyzer-seed-023', '1.0.0',
'Analyzes a batch of customer feedback and extracts themes, sentiment, and priorities.',
'Analyze the following customer feedback and extract actionable insights.

**Product area:** {{product_area}}
**Feedback batch:**
{{feedback}}

Output:

## Sentiment Overview
- Positive: X% | Neutral: Y% | Negative: Z%
- Overall tone: (one sentence)

## Top Themes
(ranked by frequency)

| Theme | Frequency | Sentiment | Representative quote |
|-------|-----------|-----------|---------------------|

## Critical Issues (Negative, High Frequency)
- (Issues that are both common and causing strong negative reactions — fix these first)

## Quick Wins (Positive signals to amplify)
- (Things users love that could be featured or doubled down on)

## Feature Requests
| Request | Mentions | Plausibility | Notes |
|---------|----------|--------------|-------|

## Recommended Actions
1. (Highest priority — affects most users negatively)
2. (etc.)

## Quotes to Share
3-5 verbatim quotes that best capture the user sentiment (positive and negative)',
'[]', '["analyze feedback", "customer feedback", "sentiment analysis", "NPS analysis"]', '["product", "customer-success", "analytics", "research"]',
'public', 'approved', 250, 0, 0, 6, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-024', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Security Threat Model',
'security-threat-model-seed-024', '1.0.0',
'Creates a STRIDE threat model for a system or feature.',
'Create a STRIDE threat model for the following system.

**System/Feature:** {{system}}
**Description:** {{description}}
**Trust boundaries:** {{trust_boundaries}} (e.g., "browser → API → DB")
**Users/Actors:** {{actors}}

Output:

## Threat Model: {{system}}

### System Overview
Brief description of data flows and trust boundaries.

### STRIDE Analysis

For each threat category, list specific threats applicable to this system:

#### Spoofing (Authentication)
| Threat | Component | Severity | Mitigation |
|--------|-----------|----------|-----------|

#### Tampering (Integrity)
(same table)

#### Repudiation (Non-repudiation)
(same table)

#### Information Disclosure (Confidentiality)
(same table)

#### Denial of Service (Availability)
(same table)

#### Elevation of Privilege (Authorization)
(same table)

### Priority Mitigations
Top 5 highest-severity threats to address immediately.

### Out of Scope
Threats explicitly not covered and why.',
'[]', '["threat model", "security review", "STRIDE", "security analysis"]', '["security", "engineering", "architecture", "compliance"]',
'public', 'approved', 320, 0, 0, 9, 0, unixepoch('now') * 1000, unixepoch('now') * 1000),

('seed-025', '51152a3d-f1cd-4a63-97a4-e04f97783354', 'b105ada5-1ec8-4934-9e09-0fe06ab4cf99',
'Refactoring Plan Generator',
'refactoring-plan-generator-seed-025', '1.0.0',
'Creates a safe, incremental refactoring plan for legacy or messy code.',
'Create a refactoring plan for the following code/system.

**What needs refactoring:** {{description}}
**Current problems:** {{problems}}
**Language/Framework:** {{stack}}
**Test coverage:** {{test_coverage}} (e.g., "80% unit tests", "no tests", "integration only")
**Team size:** {{team_size}}

Output:

## Refactoring Plan: {{description}}

### Why Refactor
Business and technical motivation — what risk or cost does this address?

### Scope
What''s in scope, what''s explicitly out of scope for this effort.

### Risk Assessment
- Regression risk: Low / Medium / High
- Estimated effort: S / M / L / XL
- Recommended team: (size and roles)

### Prerequisites
- [ ] Test coverage to add before starting
- [ ] Documentation to capture
- [ ] Dependencies to untangle first

### Incremental Steps
(Each step should be independently deployable and leave the system in a working state)

Step 1: (safest, most isolated change)
Step 2: ...

### Definition of Done
- [ ] All existing tests pass
- [ ] No performance regression (define benchmark)
- [ ] Code review sign-off
- [ ] Documentation updated',
'[]', '["refactor plan", "code refactoring", "technical debt", "cleanup code"]', '["engineering", "architecture", "code-quality", "planning"]',
'public', 'approved', 280, 0, 0, 7, 0, unixepoch('now') * 1000, unixepoch('now') * 1000);
