import { Command } from 'commander'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import pc from 'picocolors'

// ── Config ─────────────────────────────────────────────────────────────────

const CONFIG_DIR = join(homedir(), '.raxteam')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

type Config = { apiKey: string; apiUrl: string }

function loadConfig(): Config | null {
  if (!existsSync(CONFIG_PATH)) return null
  try { return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) }
  catch { return null }
}

function saveConfig(cfg: Config) {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
}

function requireConfig(): Config {
  const cfg = loadConfig()
  if (!cfg) {
    console.error(pc.red('Not logged in. Run: raxteam login'))
    process.exit(1)
  }
  return cfg
}

// ── API helper ─────────────────────────────────────────────────────────────

async function api<T>(
  cfg: Config,
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${cfg.apiUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status} ${text}`)
  }
  return res.json() as Promise<T>
}

// ── Formatting helpers ─────────────────────────────────────────────────────

function statusColor(s: string) {
  if (s === 'approved') return pc.green(s)
  if (s === 'pending') return pc.yellow(s)
  if (s === 'deprecated') return pc.red(s)
  return pc.dim(s)
}

function table(rows: string[][], headers: string[]) {
  const cols = headers.length
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => (r[i] ?? '').length)))
  const line = widths.map(w => '─'.repeat(w + 2)).join('┼')
  const fmt = (row: string[]) => row.map((v, i) => ` ${v.padEnd(widths[i])} `).join('│')
  console.log(pc.dim('┌' + widths.map(w => '─'.repeat(w + 2)).join('┬') + '┐'))
  console.log(pc.dim('│') + pc.bold(fmt(headers)) + pc.dim('│'))
  console.log(pc.dim('├' + line + '┤'))
  rows.forEach(r => console.log(pc.dim('│') + fmt(r) + pc.dim('│')))
  console.log(pc.dim('└' + widths.map(w => '─'.repeat(w + 2)).join('┴') + '┘'))
}

// ── CLI ────────────────────────────────────────────────────────────────────

const program = new Command()
  .name('raxteam')
  .description('RaxTeam CLI — manage AI skills from your terminal')
  .version('0.1.0')

// ── raxteam login ──────────────────────────────────────────────────────────
program
  .command('login')
  .description('Save your API key for future commands')
  .option('--key <api-key>', 'Your RaxTeam API key (sk-...)')
  .option('--url <url>', 'API base URL', 'https://api.raxteam.com')
  .action(async (opts) => {
    const apiKey: string = opts.key ?? await prompt('API key (sk-...): ')
    if (!apiKey.startsWith('sk-')) {
      console.error(pc.red('API key must start with sk-'))
      process.exit(1)
    }
    const cfg: Config = { apiKey, apiUrl: opts.url }
    try {
      const user = await api<{ id: string; name: string; email: string }>(cfg, '/me')
      saveConfig(cfg)
      console.log(pc.green(`✓ Logged in as ${user.name} (${user.email})`))
      console.log(pc.dim(`  Config saved to ${CONFIG_PATH}`))
    } catch (e) {
      console.error(pc.red(`Login failed: ${(e as Error).message}`))
      process.exit(1)
    }
  })

// ── raxteam whoami ─────────────────────────────────────────────────────────
program
  .command('whoami')
  .description('Show current logged-in user')
  .action(async () => {
    const cfg = requireConfig()
    const user = await api<{ name: string; email: string; role: string }>(cfg, '/me')
    console.log(`${pc.bold(user.name)}  ${pc.dim(user.email)}  ${pc.cyan(user.role)}`)
  })

// ── raxteam logout ─────────────────────────────────────────────────────────
program
  .command('logout')
  .description('Remove saved credentials')
  .action(() => {
    if (existsSync(CONFIG_PATH)) writeFileSync(CONFIG_PATH, '{}')
    console.log(pc.green('✓ Logged out'))
  })

// ── raxteam skill ──────────────────────────────────────────────────────────
const skill = program.command('skill').description('Manage skills')

// raxteam skill list
skill
  .command('list')
  .description('List all skills in your org')
  .option('--status <status>', 'Filter by status (draft|pending|approved|deprecated)')
  .option('--json', 'Output raw JSON')
  .action(async (opts) => {
    const cfg = requireConfig()
    const qs = opts.status ? `?status=${opts.status}` : ''
    const { skills } = await api<{ skills: any[] }>(cfg, `/skills${qs}`)
    if (opts.json) { console.log(JSON.stringify(skills, null, 2)); return }
    if (skills.length === 0) { console.log(pc.dim('No skills found.')); return }
    table(
      skills.map(s => [s.id.slice(0, 8), s.name, s.version, statusColor(s.status), s.visibility, String(s.useCount)]),
      ['ID', 'Name', 'Version', 'Status', 'Visibility', 'Uses'],
    )
    console.log(pc.dim(`\n  ${skills.length} skill${skills.length !== 1 ? 's' : ''}`))
  })

// raxteam skill get <id>
skill
  .command('get <id>')
  .description('Show a skill and its prompt template')
  .action(async (id, opts) => {
    const cfg = requireConfig()
    const s = await api<any>(cfg, `/skills/${id}`)
    console.log(pc.bold(s.name) + pc.dim(` (${s.id})`))
    console.log(`  Version: ${pc.cyan(s.version)}  Status: ${statusColor(s.status)}  Visibility: ${s.visibility}`)
    console.log(`  ${pc.dim(s.description)}`)
    console.log()
    console.log(pc.dim('─── Prompt Template ───────────────────────────────────'))
    console.log(s.promptTemplate)
  })

// raxteam skill push <file.json>
skill
  .command('push <file>')
  .description('Create or update a skill from a JSON file')
  .option('--update <id>', 'Update an existing skill by ID')
  .action(async (file, opts) => {
    const cfg = requireConfig()
    if (!existsSync(file)) { console.error(pc.red(`File not found: ${file}`)); process.exit(1) }

    let data: any
    try { data = JSON.parse(readFileSync(file, 'utf-8')) }
    catch { console.error(pc.red('Invalid JSON')); process.exit(1) }

    const required = ['name', 'description', 'promptTemplate']
    const missing = required.filter(k => !data[k])
    if (missing.length) { console.error(pc.red(`Missing fields: ${missing.join(', ')}`)); process.exit(1) }

    if (opts.update) {
      await api(cfg, `/skills/${opts.update}`, { method: 'PATCH', body: data })
      console.log(pc.green(`✓ Updated skill ${opts.update}`))
    } else {
      const result = await api<{ id: string; name: string }>(cfg, '/skills', { method: 'POST', body: data })
      console.log(pc.green(`✓ Created skill ${pc.bold(result.name)} (${result.id})`))
    }
  })

// raxteam skill versions <id>
skill
  .command('versions <id>')
  .description('List saved versions of a skill')
  .action(async (id) => {
    const cfg = requireConfig()
    const { versions, current } = await api<{ versions: any[]; current: string }>(cfg, `/skills/${id}/versions`)
    if (versions.length === 0) { console.log(pc.dim('No saved versions.')); return }
    console.log(`Current: ${pc.cyan(current)}\n`)
    table(
      versions.map(v => [v.version, v.changelog || pc.dim('—'), new Date(v.createdAt).toLocaleDateString()]),
      ['Version', 'Changelog', 'Date'],
    )
  })

// raxteam skill snapshot <id> <label>
skill
  .command('snapshot <id> <label>')
  .description('Save current template as a named version (e.g. v2)')
  .option('--changelog <text>', 'What changed')
  .action(async (id, label, opts) => {
    const cfg = requireConfig()
    const result = await api<{ version: string }>(cfg, `/skills/${id}/versions`, {
      method: 'POST',
      body: { version: label, changelog: opts.changelog ?? '' },
    })
    console.log(pc.green(`✓ Saved version ${pc.bold(result.version)}`))
  })

// raxteam skill promote <id> <version>
skill
  .command('promote <id> <version>')
  .description('Promote a saved version to the active template')
  .action(async (id, version) => {
    const cfg = requireConfig()
    await api(cfg, `/skills/${id}/versions/${version}/promote`, { method: 'POST' })
    console.log(pc.green(`✓ Promoted ${pc.bold(version)} to active template`))
    console.log(pc.yellow('  Skill status reset to draft — submit for review to re-approve.'))
  })

// raxteam skill test <id>
skill
  .command('test <id>')
  .description('Run all eval test cases for a skill')
  .option('--json', 'Output raw JSON')
  .action(async (id, opts) => {
    const cfg = requireConfig()
    console.log(pc.dim('Running evals…'))
    const result = await api<{ results: any[]; passed: number; total: number; version: string }>(
      cfg, `/skills/${id}/evals/run`, { method: 'POST' },
    )
    if (opts.json) { console.log(JSON.stringify(result, null, 2)); return }

    const { results, passed, total, version } = result
    console.log(`\nSkill version: ${pc.cyan(version)}`)
    console.log(`Results: ${passed === total ? pc.green(`${passed}/${total} passed ✓`) : pc.red(`${passed}/${total} passed`)}`)
    console.log()

    results.forEach((r, i) => {
      const icon = r.passed ? pc.green('✓') : pc.red('✗')
      const score = `${Math.round((r.score ?? 0) * 100)}%`
      console.log(`${icon} [${i + 1}] ${r.description || pc.dim('(no description)')}  ${pc.dim(score)}`)
      if (!r.passed) {
        console.log(pc.dim('  rendered: ') + r.rendered.slice(0, 120).replace(/\n/g, '↵'))
      }
    })

    process.exit(passed === total ? 0 : 1)
  })

// raxteam skill evals <id>
skill
  .command('evals <id>')
  .description('List test cases for a skill')
  .action(async (id) => {
    const cfg = requireConfig()
    const { cases } = await api<{ cases: any[] }>(cfg, `/skills/${id}/evals`)
    if (cases.length === 0) { console.log(pc.dim('No test cases. Add one: raxteam eval add <id>')); return }
    table(
      cases.map(c => [
        c.id.slice(0, 8),
        c.description || pc.dim('—'),
        c.expectedOutput.slice(0, 40),
        c.lastRun ? (c.lastRun.passed ? pc.green('pass') : pc.red('fail')) : pc.dim('never run'),
      ]),
      ['ID', 'Description', 'Expected (truncated)', 'Last run'],
    )
  })

// ── raxteam eval add <skill-id> ────────────────────────────────────────────
const evalCmd = program.command('eval').description('Manage eval test cases')

evalCmd
  .command('add <skillId>')
  .description('Add a test case to a skill')
  .requiredOption('--expected <text>', 'Expected output (or substring)')
  .option('--desc <text>', 'Description of this test case')
  .option('--vars <json>', 'Input variables as JSON e.g. \'{"name":"Alice"}\'')
  .action(async (skillId, opts) => {
    const cfg = requireConfig()
    let inputVars: Record<string, string> = {}
    if (opts.vars) {
      try { inputVars = JSON.parse(opts.vars) }
      catch { console.error(pc.red('--vars must be valid JSON')); process.exit(1) }
    }
    const tc = await api<{ id: string }>(cfg, `/skills/${skillId}/evals`, {
      method: 'POST',
      body: { description: opts.desc ?? '', inputVars, expectedOutput: opts.expected },
    })
    console.log(pc.green(`✓ Test case created (${tc.id.slice(0, 8)})`))
  })

evalCmd
  .command('rm <skillId> <caseId>')
  .description('Remove a test case')
  .action(async (skillId, caseId) => {
    const cfg = requireConfig()
    await api(cfg, `/skills/${skillId}/evals/${caseId}`, { method: 'DELETE' })
    console.log(pc.green('✓ Deleted'))
  })

// ── stdin prompt helper ────────────────────────────────────────────────────
function prompt(question: string): Promise<string> {
  process.stdout.write(question)
  return new Promise(resolve => {
    let buf = ''
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', chunk => { buf += chunk })
    process.stdin.on('end', () => resolve(buf.trim()))
    process.stdin.resume()
  })
}

program.parse()
