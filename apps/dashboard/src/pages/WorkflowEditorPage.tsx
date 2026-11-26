import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type NodeProps,
  type Connection,
  type Node,
  type Edge,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { api, type Workflow, type WorkflowNode, type WorkflowEdge, type WorkflowRun, type WorkflowVersion, type WorkflowDefinition, type Skill, type OrgSecret } from '../lib/api'

// ─── Combobox — searchable select ───────────────────────────────────────────

type ComboOption = { id: string; label: string; sublabel?: string }

function Combobox({ options, value, onChange, placeholder }: {
  options: ComboOption[]
  value: string
  onChange: (id: string, label: string) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const filtered = options.filter(o =>
    !query || o.label.toLowerCase().includes(query.toLowerCase()) || (o.sublabel ?? '').toLowerCase().includes(query.toLowerCase())
  )
  const selectedLabel = options.find(o => o.id === value)?.label ?? ''
  return (
    <div className="relative">
      <input
        value={open ? query : selectedLabel}
        onFocus={() => { setOpen(true); setQuery('') }}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        onChange={e => { setQuery(e.target.value); if (!open) setOpen(true) }}
        placeholder={placeholder ?? 'Search…'}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
      />
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0
            ? <p className="px-3 py-2 text-xs text-gray-400">No matches</p>
            : filtered.slice(0, 60).map(o => (
              <button key={o.id} onMouseDown={() => { onChange(o.id, o.label); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-violet-50 transition-colors ${o.id === value ? 'bg-violet-50/60' : ''}`}>
                <div className="font-medium text-gray-800 truncate">{o.label}</div>
                {o.sublabel && <div className="text-xs text-gray-400 truncate">{o.sublabel}</div>}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

// ─── Custom Nodes ───────────────────────────────────────────────────────────

function InputNode({ data, selected }: NodeProps) {
  return (
    <div className={`bg-white rounded-xl border-2 px-4 py-3 shadow-sm min-w-[140px] transition-all ${selected ? 'border-violet-500 ring-2 ring-violet-200' : 'border-emerald-300'}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Start</span>
      </div>
      <p className="text-xs text-gray-500">{(data as { label?: string }).label || 'Input'}</p>
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-400 !w-3 !h-3" />
    </div>
  )
}

function OutputNode({ data, selected }: NodeProps) {
  return (
    <div className={`bg-white rounded-xl border-2 px-4 py-3 shadow-sm min-w-[140px] transition-all ${selected ? 'border-violet-500 ring-2 ring-violet-200' : 'border-rose-300'}`}>
      <Handle type="target" position={Position.Top} className="!bg-rose-400 !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-lg bg-rose-100 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-rose-700 uppercase tracking-wide">End</span>
      </div>
      <p className="text-xs text-gray-500">{(data as { label?: string }).label || 'Output'}</p>
    </div>
  )
}

function SkillNode({ data, selected }: NodeProps) {
  const d = data as { skillName?: string; label?: string }
  return (
    <div className={`bg-white rounded-xl border-2 px-4 py-3 shadow-sm min-w-[160px] transition-all ${selected ? 'border-violet-500 ring-2 ring-violet-200' : 'border-blue-300'}`}>
      <Handle type="target" position={Position.Top} className="!bg-blue-400 !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Skill</span>
      </div>
      <p className="text-sm font-medium text-gray-800 truncate max-w-[140px]">{d.skillName || d.label || <span className="text-gray-400 italic">Select skill</span>}</p>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-400 !w-3 !h-3" />
    </div>
  )
}

function ConditionNode({ data, selected }: NodeProps) {
  const d = data as { condition?: string; label?: string }
  return (
    <div className={`bg-white rounded-xl border-2 px-4 py-3 shadow-sm min-w-[160px] transition-all ${selected ? 'border-violet-500 ring-2 ring-violet-200' : 'border-amber-300'}`}>
      <Handle type="target" position={Position.Top} className="!bg-amber-400 !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Condition</span>
      </div>
      <p className="text-xs text-gray-600 font-mono truncate max-w-[140px]">{d.condition || 'No condition set'}</p>
      <Handle type="source" position={Position.Right} id="true" className="!bg-emerald-400 !w-3 !h-3" style={{ top: '60%' }} />
      <Handle type="source" position={Position.Bottom} id="false" className="!bg-red-400 !w-3 !h-3" />
      <div className="absolute right-[-28px] top-[55%] text-[9px] text-emerald-600 font-semibold">T</div>
      <div className="absolute bottom-[-16px] left-1/2 -translate-x-1/2 text-[9px] text-red-500 font-semibold">F</div>
    </div>
  )
}

function MCPToolNode({ data, selected }: NodeProps) {
  const d = data as { mcpTool?: string; mcpServerUrl?: string; label?: string }
  return (
    <div className={`bg-white rounded-xl border-2 px-4 py-3 shadow-sm min-w-[160px] transition-all ${selected ? 'border-violet-500 ring-2 ring-violet-200' : 'border-purple-300'}`}>
      <Handle type="target" position={Position.Top} className="!bg-purple-400 !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-lg bg-purple-100 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">MCP Tool</span>
      </div>
      <p className="text-sm font-medium text-gray-800 truncate max-w-[140px]">{d.mcpTool || 'No tool selected'}</p>
      {d.mcpServerUrl && <p className="text-[10px] text-gray-400 truncate max-w-[140px] mt-0.5">{d.mcpServerUrl}</p>}
      <Handle type="source" position={Position.Bottom} className="!bg-purple-400 !w-3 !h-3" />
    </div>
  )
}

function SubWorkflowNode({ data, selected }: NodeProps) {
  const d = data as { workflowName?: string; label?: string }
  return (
    <div className={`bg-white rounded-xl border-2 px-4 py-3 shadow-sm min-w-[160px] transition-all ${selected ? 'border-violet-500 ring-2 ring-violet-200' : 'border-teal-300'}`}>
      <Handle type="target" position={Position.Top} className="!bg-teal-400 !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-lg bg-teal-100 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-teal-700 uppercase tracking-wide">Sub-Workflow</span>
      </div>
      <p className="text-sm font-medium text-gray-800 truncate max-w-[140px]">{d.workflowName || 'Select workflow'}</p>
      <Handle type="source" position={Position.Bottom} className="!bg-teal-400 !w-3 !h-3" />
    </div>
  )
}

function NoteNode({ data, selected }: NodeProps) {
  const d = data as { label?: string; description?: string }
  return (
    <div className={`bg-yellow-50 rounded-xl border-2 px-4 py-3 shadow-sm min-w-[140px] max-w-[240px] transition-all ${selected ? 'border-violet-500 ring-2 ring-violet-200' : 'border-yellow-200'}`}>
      <p className="text-xs font-semibold text-yellow-700 mb-1">Note</p>
      <p className="text-xs text-gray-600 whitespace-pre-wrap">{d.label || d.description || 'Add note…'}</p>
    </div>
  )
}

const nodeTypes = {
  input: InputNode,
  output: OutputNode,
  skill: SkillNode,
  condition: ConditionNode,
  mcp_tool: MCPToolNode,
  sub_workflow: SubWorkflowNode,
  note: NoteNode,
}

// ─── Main Editor ─────────────────────────────────────────────────────────────

type RightPanel = 'properties' | 'run' | 'versions'

function fmtDur(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function WorkflowEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [rightPanel, setRightPanel] = useState<RightPanel>('properties')
  const [rightPanelOpen, setRightPanelOpen] = useState(true)

  // Workflow metadata editing
  const [wfName, setWfName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [wfDesc, setWfDesc] = useState('')
  const [editingDesc, setEditingDesc] = useState(false)

  // Skills list for dropdown
  const [skills, setSkills] = useState<Skill[]>([])
  const [skillsLoaded, setSkillsLoaded] = useState(false)

  // Sub-workflows for dropdown
  const [allWorkflows, setAllWorkflows] = useState<Workflow[]>([])

  // Secrets for MCP header insertion
  const [orgSecrets, setOrgSecrets] = useState<OrgSecret[]>([])
  const [secretDropdownTarget, setSecretDropdownTarget] = useState<string | null>(null) // header key that's being targeted

  // Run panel
  const [inputVars, setInputVars] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [currentRun, setCurrentRun] = useState<WorkflowRun | null>(null)
  const [runHistory, setRunHistory] = useState<WorkflowRun[]>([])
  const [runError, setRunError] = useState('')

  // Versions panel
  const [versions, setVersions] = useState<WorkflowVersion[]>([])
  const [versionLabel, setVersionLabel] = useState('')
  const [versionChangelog, setVersionChangelog] = useState('')
  const [savingVersion, setSavingVersion] = useState(false)
  const [versionMsg, setVersionMsg] = useState('')

  // AI Assist
  const [showAiAssist, setShowAiAssist] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  // Publishing
  const [publishing, setPublishing] = useState(false)

  // Load workflow
  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      api.workflows.get(id),
      api.workflows.runs(id).catch(() => ({ runs: [] as WorkflowRun[] })),
    ]).then(([wf, runsRes]) => {
      setWorkflow(wf)
      setWfName(wf.name)
      setWfDesc(wf.description ?? '')
      if (wf.definition) {
        setNodes(wf.definition.nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data })))
        setEdges(wf.definition.edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, label: e.label })))
      } else {
        // Default start/end nodes
        setNodes([
          { id: 'input-1', type: 'input', position: { x: 250, y: 50 }, data: { label: 'Start' } },
          { id: 'output-1', type: 'output', position: { x: 250, y: 300 }, data: { label: 'End' } },
        ])
      }
      setRunHistory(runsRes.runs.slice(0, 5).map(r => ({
        ...r,
        steps: Array.isArray(r.steps) ? r.steps : (typeof r.steps === 'string' ? JSON.parse(r.steps) : []),
      })))
    }).catch(() => navigate('/workflows')).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Load skills + sibling workflows (for sub-workflow/orchestrator selector)
  useEffect(() => {
    if (!skillsLoaded) {
      api.skills.list({ limit: 200 }).then(r => { setSkills(r.skills); setSkillsLoaded(true) }).catch(() => {})
      api.workflows.list({ limit: 200 }).then(r => setAllWorkflows(r.workflows)).catch(() => {})
      api.secrets.list().then(r => setOrgSecrets(r.secrets)).catch(() => {})
    }
  }, [skillsLoaded])

  // Load versions when panel opens
  useEffect(() => {
    if (rightPanel === 'versions' && id) {
      api.workflows.versions(id).then(r => setVersions(r.versions)).catch(() => {})
    }
  }, [rightPanel, id])

  // Auto-save with debounce
  const scheduleSave = useCallback(() => {
    if (!id) return
    setSaveStatus('unsaved')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        await api.workflows.update(id, {
          definition: {
            nodes: nodes.map(n => ({ id: n.id, type: n.type as WorkflowNode['type'], position: n.position, data: n.data as WorkflowNode['data'] })),
            edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? undefined, targetHandle: e.targetHandle ?? undefined, label: typeof e.label === 'string' ? e.label : undefined })),
          },
        })
        setSaveStatus('saved')
      } catch {
        setSaveStatus('unsaved')
      }
    }, 1500)
  }, [id, nodes, edges])

  useEffect(() => { scheduleSave() }, [nodes, edges]) // eslint-disable-line react-hooks/exhaustive-deps

  const onConnect = useCallback((conn: Connection) => {
    setEdges(eds => addEdge({ ...conn, id: `e-${Date.now()}` }, eds))
  }, [setEdges])

  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null

  function addNode(type: WorkflowNode['type']) {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position: { x: 200 + Math.random() * 100, y: 150 + Math.random() * 100 },
      data: type === 'input' ? { label: 'Start' } : type === 'output' ? { label: 'End' } : {},
    }
    setNodes(ns => [...ns, newNode])
    setSelectedNodeId(newNode.id)
    setRightPanel('properties')
    setRightPanelOpen(true)
  }

  function updateNodeData(nodeId: string, patch: Record<string, unknown>) {
    setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n))
  }

  function autoLayout() {
    const newNodes = nodes.map((n, i) => {
      const col = i % 3
      const row = Math.floor(i / 3)
      return { ...n, position: { x: 80 + col * 220, y: 60 + row * 140 } }
    })
    setNodes(newNodes)
  }

  async function saveName() {
    if (!id || !wfName.trim()) return
    setEditingName(false)
    await api.workflows.update(id, { name: wfName }).catch(() => {})
    setWorkflow(w => w ? { ...w, name: wfName } : w)
  }

  async function saveDesc() {
    if (!id) return
    setEditingDesc(false)
    await api.workflows.update(id, { description: wfDesc }).catch(() => {})
    setWorkflow(w => w ? { ...w, description: wfDesc } : w)
  }

  async function publishWorkflow() {
    if (!id) return
    setPublishing(true)
    try {
      await api.workflows.publish(id)
      setWorkflow(w => w ? { ...w, status: 'published' } : w)
    } catch { /* ignore */ }
    finally { setPublishing(false) }
  }

  async function saveVersion() {
    if (!id || !versionLabel.trim()) return
    setSavingVersion(true)
    setVersionMsg('')
    try {
      const v = await api.workflows.saveVersion(id, versionLabel, versionChangelog)
      setVersions(vs => [v, ...vs])
      setVersionLabel(''); setVersionChangelog('')
      setVersionMsg('Version saved!')
    } catch (e: unknown) {
      setVersionMsg((e as Error).message)
    } finally { setSavingVersion(false) }
  }

  async function runWorkflow() {
    if (!id) return
    setRunning(true)
    setRunError('')
    setCurrentRun(null)
    try {
      const result = await api.workflows.run(id, inputVars)
      const run = result.run
      // steps may be stored as a JSON string in D1
      if (typeof run.steps === 'string') run.steps = JSON.parse(run.steps)
      if (!Array.isArray(run.steps)) run.steps = []
      setCurrentRun(run)
      setRunHistory(h => [run, ...h].slice(0, 5))
    } catch (e: unknown) {
      setRunError((e as Error).message)
    } finally { setRunning(false) }
  }

  const [aiPreview, setAiPreview] = useState<WorkflowDefinition | null>(null)

  async function handleAiAssist() {
    if (!aiPrompt.trim() || !id) return
    setAiLoading(true)
    setAiError('')
    setAiPreview(null)
    try {
      const result = await api.workflows.aiBuild(id, aiPrompt)
      setAiPreview(result.definition)
    } catch (e: unknown) {
      setAiError((e as Error).message || 'Could not generate workflow. Please try again.')
    } finally { setAiLoading(false) }
  }

  function applyAiPreview() {
    if (!aiPreview) return
    setNodes(aiPreview.nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data })))
    setEdges(aiPreview.edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, label: e.label })))
    setAiPreview(null)
    setShowAiAssist(false)
    setAiPrompt('')
  }

  const inputSchema = workflow?.definition?.inputSchema ?? []

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
    </div>
  )

  const isSupervisor = workflow?.type === 'supervisor'
  const paletteItems: { type: WorkflowNode['type']; label: string; color: string; icon: React.ReactNode }[] = [
    { type: 'skill', label: 'Skill', color: 'blue', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /> },
    { type: 'condition', label: 'Condition', color: 'amber', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> },
    { type: 'mcp_tool', label: 'MCP Tool', color: 'purple', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
    ...(isSupervisor
      ? [{ type: 'sub_workflow' as const, label: 'Orchestrator', color: 'indigo', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /> }]
      : [{ type: 'sub_workflow' as const, label: 'Sub-Workflow', color: 'teal', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /> }]
    ),
    { type: 'note', label: 'Note', color: 'yellow', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /> },
    { type: 'input', label: 'Start', color: 'emerald', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" /> },
    { type: 'output', label: 'End', color: 'rose', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" /> },
  ]

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
    teal: 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
  }

  return (
    <div className="flex h-full overflow-hidden bg-[#f8f9fb]">
      {/* Left sidebar */}
      <aside className="w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        {/* Workflow meta */}
        <div className="p-4 border-b border-gray-100">
          <button onClick={() => navigate('/workflows')} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 mb-3 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            All Workflows
          </button>

          {editingName ? (
            <input
              autoFocus
              value={wfName}
              onChange={e => setWfName(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => e.key === 'Enter' && saveName()}
              className="w-full text-sm font-semibold text-gray-900 border border-violet-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          ) : (
            <button onClick={() => setEditingName(true)} className="text-left group w-full">
              <p className="text-sm font-semibold text-gray-900 group-hover:text-violet-700 transition-colors truncate">{wfName}</p>
            </button>
          )}

          {editingDesc ? (
            <textarea
              autoFocus
              value={wfDesc}
              onChange={e => setWfDesc(e.target.value)}
              onBlur={saveDesc}
              onKeyDown={e => e.key === 'Escape' && saveDesc()}
              rows={3}
              placeholder="Describe what this workflow does…"
              className="w-full mt-1.5 text-xs text-gray-600 border border-violet-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none"
            />
          ) : (
            <button onClick={() => setEditingDesc(true)} className="text-left group w-full mt-1.5">
              <p className="text-xs text-gray-400 group-hover:text-gray-600 transition-colors leading-relaxed line-clamp-3">
                {wfDesc || <span className="italic">Add description…</span>}
              </p>
            </button>
          )}

          <div className="flex items-center gap-2 mt-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${workflow?.type === 'orchestrator' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
              {workflow?.type}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${workflow?.status === 'published' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-gray-50 text-gray-500 border-gray-100'}`}>
              {workflow?.status}
            </span>
          </div>

          <div className="flex gap-2 mt-3">
            <button
              onClick={publishWorkflow}
              disabled={publishing || workflow?.status === 'published'}
              className="flex-1 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              {publishing ? 'Publishing…' : workflow?.status === 'published' ? 'Published' : 'Publish'}
            </button>
            <div className={`text-[10px] flex items-center gap-1 px-2 rounded-lg ${saveStatus === 'saved' ? 'text-emerald-600' : saveStatus === 'saving' ? 'text-amber-500' : 'text-gray-400'}`}>
              {saveStatus === 'saving' && <div className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />}
              {saveStatus === 'saved' && '✓'}
              {saveStatus}
            </div>
          </div>
        </div>

        {/* Node palette */}
        <div className="flex-1 p-4 overflow-y-auto">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Add Node</p>
          <div className="space-y-1.5">
            {paletteItems.map(item => (
              <button
                key={item.type}
                onClick={() => addNode(item.type)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${colorMap[item.color]}`}
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {item.icon}
                </svg>
                {item.label}
                <svg className="w-3 h-3 ml-auto opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            ))}
          </div>

          {/* AI Assist */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <button
              onClick={() => setShowAiAssist(true)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 text-violet-700 rounded-lg text-xs font-semibold hover:from-violet-100 hover:to-purple-100 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Build with AI
            </button>
          </div>
        </div>
      </aside>

      {/* Canvas */}
      <div className="flex-1 relative">
        {/* Toolbar */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl shadow-sm px-2 py-1.5">
          <button onClick={autoLayout} title="Auto-layout" className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-colors font-medium">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Layout
          </button>
        </div>

        {/* Right panel toggles */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl shadow-sm px-2 py-1.5">
          {([
            { key: 'properties' as RightPanel, icon: <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />, label: 'Properties' },
            { key: 'run' as RightPanel, icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></>, label: 'Run' },
            { key: 'versions' as RightPanel, icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />, label: 'Versions' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => { setRightPanel(tab.key); setRightPanelOpen(rp => tab.key === rightPanel ? !rp : true) }}
              title={tab.label}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors font-medium ${rightPanel === tab.key && rightPanelOpen ? 'bg-violet-600 text-white' : 'text-gray-600 hover:text-violet-700 hover:bg-violet-50'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {tab.icon}
              </svg>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => { setSelectedNodeId(node.id); setRightPanel('properties'); setRightPanelOpen(true) }}
          onPaneClick={() => setSelectedNodeId(null)}
          fitView
          className="bg-[#f8f9fb]"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d1d5db" />
          <Controls className="!shadow-sm !border-gray-200 !bg-white !rounded-xl" />
          <MiniMap className="!shadow-sm !border-gray-200 !bg-white !rounded-xl" nodeStrokeWidth={3} />
        </ReactFlow>
      </div>

      {/* Right panel */}
      {rightPanelOpen && (
        <aside className="w-80 shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
          {rightPanel === 'properties' && (
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Properties</p>
              {!selectedNode ? (
                <div className="text-center py-12">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-400">Select a node to edit its properties</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Label</label>
                    <input
                      value={(selectedNode.data as { label?: string }).label ?? ''}
                      onChange={e => updateNodeData(selectedNode.id, { label: e.target.value })}
                      placeholder="Node label"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                    />
                  </div>

                  {selectedNode.type !== 'note' && (
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Description</label>
                      <textarea
                        value={(selectedNode.data as { description?: string }).description ?? ''}
                        onChange={e => updateNodeData(selectedNode.id, { description: e.target.value })}
                        placeholder="Optional instructions for this node…"
                        rows={2}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                      />
                    </div>
                  )}

                  {selectedNode.type === 'skill' && (
                    <>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Skill</label>
                        <Combobox
                          options={skills.map(s => ({ id: s.id, label: s.name, sublabel: s.description?.slice(0, 80) }))}
                          value={(selectedNode.data as { skillId?: string }).skillId ?? ''}
                          onChange={(id, label) => updateNodeData(selectedNode.id, { skillId: id, skillName: label })}
                          placeholder="Search skills…"
                        />
                      </div>
                      {(selectedNode.data as { skillId?: string }).skillId && (
                        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 leading-relaxed">
                          {skills.find(s => s.id === (selectedNode.data as { skillId?: string }).skillId)?.description}
                        </p>
                      )}
                    </>
                  )}

                  {selectedNode.type === 'condition' && (
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Condition Expression</label>
                      <textarea
                        value={(selectedNode.data as { condition?: string }).condition ?? ''}
                        onChange={e => updateNodeData(selectedNode.id, { condition: e.target.value })}
                        placeholder="e.g. {{score}} > 0.8"
                        rows={3}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">Use {'{{variable}}'} syntax to reference previous outputs.</p>
                    </div>
                  )}

                  {selectedNode.type === 'mcp_tool' && (
                    <>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Server URL</label>
                        <input
                          value={(selectedNode.data as { mcpServerUrl?: string }).mcpServerUrl ?? ''}
                          onChange={e => updateNodeData(selectedNode.id, { mcpServerUrl: e.target.value })}
                          placeholder="https://mcp.example.com"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Tool Name</label>
                        <input
                          value={(selectedNode.data as { mcpTool?: string }).mcpTool ?? ''}
                          onChange={e => updateNodeData(selectedNode.id, { mcpTool: e.target.value })}
                          placeholder="tool_name"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Headers</label>
                          <button
                            onClick={() => {
                              const current = (selectedNode.data as { mcpHeaders?: Record<string, string> }).mcpHeaders ?? {}
                              const key = `Header-${Object.keys(current).length + 1}`
                              updateNodeData(selectedNode.id, { mcpHeaders: { ...current, [key]: '' } })
                            }}
                            className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                          >+ Add header</button>
                        </div>
                        {Object.entries((selectedNode.data as { mcpHeaders?: Record<string, string> }).mcpHeaders ?? {}).map(([hk, hv]) => (
                          <div key={hk} className="flex gap-1.5 mb-1.5">
                            <input
                              value={hk}
                              onChange={e => {
                                const current = { ...((selectedNode.data as { mcpHeaders?: Record<string, string> }).mcpHeaders ?? {}) }
                                const val = current[hk]
                                delete current[hk]
                                current[e.target.value] = val
                                updateNodeData(selectedNode.id, { mcpHeaders: current })
                              }}
                              placeholder="Header-Name"
                              className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-violet-300"
                            />
                            <div className="relative flex-1">
                              <input
                                value={hv}
                                onChange={e => {
                                  const current = { ...((selectedNode.data as { mcpHeaders?: Record<string, string> }).mcpHeaders ?? {}) }
                                  current[hk] = e.target.value
                                  updateNodeData(selectedNode.id, { mcpHeaders: current })
                                }}
                                placeholder="value or {{secret:MY_KEY}}"
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-violet-300"
                              />
                              {orgSecrets.length > 0 && (
                                <div className="absolute right-1 top-1/2 -translate-y-1/2">
                                  <button
                                    onClick={() => setSecretDropdownTarget(secretDropdownTarget === hk ? null : hk)}
                                    className="text-[10px] px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded font-medium hover:bg-amber-100 transition-colors"
                                    title="Insert secret reference"
                                  >🔑</button>
                                  {secretDropdownTarget === hk && (
                                    <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[160px] max-h-40 overflow-y-auto">
                                      {orgSecrets.map(s => (
                                        <button
                                          key={s.id}
                                          onMouseDown={() => {
                                            const current = { ...((selectedNode.data as { mcpHeaders?: Record<string, string> }).mcpHeaders ?? {}) }
                                            current[hk] = `{{secret:${s.name}}}`
                                            updateNodeData(selectedNode.id, { mcpHeaders: current })
                                            setSecretDropdownTarget(null)
                                          }}
                                          className="w-full text-left px-3 py-2 text-xs font-mono text-gray-700 hover:bg-violet-50 transition-colors"
                                        >
                                          {s.name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => {
                                const current = { ...((selectedNode.data as { mcpHeaders?: Record<string, string> }).mcpHeaders ?? {}) }
                                delete current[hk]
                                updateNodeData(selectedNode.id, { mcpHeaders: current })
                              }}
                              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Input Template</label>
                          {orgSecrets.length > 0 && (
                            <div className="relative">
                              <button
                                onClick={() => setSecretDropdownTarget(secretDropdownTarget === '__mcpInput__' ? null : '__mcpInput__')}
                                className="text-[10px] px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded font-medium hover:bg-amber-100 transition-colors"
                              >🔑 Insert secret</button>
                              {secretDropdownTarget === '__mcpInput__' && (
                                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[160px] max-h-40 overflow-y-auto">
                                  {orgSecrets.map(s => (
                                    <button
                                      key={s.id}
                                      onMouseDown={() => {
                                        const current = (selectedNode.data as { mcpInput?: string }).mcpInput ?? ''
                                        updateNodeData(selectedNode.id, { mcpInput: current + `{{secret:${s.name}}}` })
                                        setSecretDropdownTarget(null)
                                      }}
                                      className="w-full text-left px-3 py-2 text-xs font-mono text-gray-700 hover:bg-violet-50 transition-colors"
                                    >
                                      {s.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <textarea
                          value={(selectedNode.data as { mcpInput?: string }).mcpInput ?? ''}
                          onChange={e => updateNodeData(selectedNode.id, { mcpInput: e.target.value })}
                          placeholder='{"query": "{{input}}"}'
                          rows={3}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                        />
                      </div>
                    </>
                  )}

                  {selectedNode.type === 'sub_workflow' && (
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">
                        {isSupervisor ? 'Orchestrator' : 'Sub-Workflow'}
                      </label>
                      <Combobox
                        options={allWorkflows
                          .filter(w => w.id !== id && (!isSupervisor || w.type === 'orchestrator'))
                          .map(w => ({ id: w.id, label: w.name, sublabel: w.description?.slice(0, 80) }))}
                        value={(selectedNode.data as { workflowId?: string }).workflowId ?? ''}
                        onChange={(wfId, wfName) => updateNodeData(selectedNode.id, { workflowId: wfId, workflowName: wfName })}
                        placeholder={isSupervisor ? 'Search orchestrators…' : 'Search workflows…'}
                      />
                      {isSupervisor && allWorkflows.filter(w => w.id !== id && w.type === 'orchestrator').length === 0 && (
                        <p className="text-xs text-gray-400 mt-1.5">No orchestrator workflows found. Create and publish one first.</p>
                      )}
                    </div>
                  )}

                  {selectedNode.type === 'note' && (
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Note Text</label>
                      <textarea
                        value={(selectedNode.data as { description?: string }).description ?? ''}
                        onChange={e => updateNodeData(selectedNode.id, { description: e.target.value, label: e.target.value })}
                        placeholder="Add a note…"
                        rows={4}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                      />
                    </div>
                  )}

                  <button
                    onClick={() => { setNodes(ns => ns.filter(n => n.id !== selectedNode.id)); setSelectedNodeId(null) }}
                    className="w-full py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-semibold transition-colors border border-red-100"
                  >
                    Remove Node
                  </button>
                </div>
              )}
            </div>
          )}

          {rightPanel === 'run' && (
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Run Workflow</p>

              {inputSchema.length > 0 && (
                <div className="space-y-3 mb-4">
                  <p className="text-xs font-semibold text-gray-600">Input Variables</p>
                  {inputSchema.map(v => (
                    <div key={v.name}>
                      <label className="text-xs text-gray-500 mb-1 block">{v.name}{v.required && <span className="text-red-400 ml-0.5">*</span>}</label>
                      <input
                        value={inputVars[v.name] ?? ''}
                        onChange={e => setInputVars(iv => ({ ...iv, [v.name]: e.target.value }))}
                        placeholder={v.description}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                      />
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={runWorkflow}
                disabled={running}
                className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors mb-4 flex items-center justify-center gap-2"
              >
                {running ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Running…</> : 'Run Workflow'}
              </button>

              {runError && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{runError}</p>}

              {currentRun && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Steps</p>
                  <div className="space-y-2">
                    {currentRun.steps.map(step => (
                      <div key={step.nodeId} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-sm ${step.status === 'completed' ? 'text-emerald-500' : step.status === 'failed' ? 'text-red-500' : step.status === 'running' ? 'text-amber-500' : 'text-gray-400'}`}>
                            {step.status === 'completed' ? '✓' : step.status === 'failed' ? '✗' : step.status === 'running' ? '⟳' : '—'}
                          </span>
                          <span className="text-xs font-medium text-gray-700">{step.label}</span>
                          <span className="text-[10px] text-gray-400 ml-auto">{step.nodeType}</span>
                        </div>
                        {step.output && (() => {
                          try {
                            const parsed = JSON.parse(step.output)
                            if (parsed.outputType === 'image') {
                              return <img src={parsed.content} alt="AI generated" className="max-w-full rounded mt-1" style={{ maxHeight: 120 }} />
                            }
                          } catch { /* not JSON */ }
                          return <p className="text-[10px] text-gray-500 font-mono truncate">{step.output}</p>
                        })()}
                        {step.error && <p className="text-[10px] text-red-500">{step.error}</p>}
                        {step.completedAt && step.startedAt && (
                          <p className="text-[10px] text-gray-400 mt-1">{fmtDur(step.completedAt - step.startedAt)}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {currentRun.output && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-gray-600 mb-1">Output</p>
                      {(() => {
                        try {
                          const parsed = JSON.parse(currentRun.output)
                          if (parsed.outputType === 'image') {
                            return <img src={parsed.content} alt="Workflow output" className="max-w-full rounded-lg border border-gray-100" />
                          }
                        } catch { /* not JSON */ }
                        return <pre className="text-[10px] bg-gray-50 border border-gray-100 rounded-lg p-3 overflow-x-auto text-gray-700 whitespace-pre-wrap">{currentRun.output}</pre>
                      })()}
                    </div>
                  )}
                </div>
              )}

              {runHistory.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">Recent Runs</p>
                  <div className="space-y-1.5">
                    {runHistory.map(run => (
                      <div key={run.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                        <span className={`text-xs ${run.status === 'completed' ? 'text-emerald-500' : run.status === 'failed' ? 'text-red-500' : 'text-amber-500'}`}>
                          {run.status === 'completed' ? '✓' : run.status === 'failed' ? '✗' : '⟳'}
                        </span>
                        <span className="text-[10px] text-gray-500 capitalize">{run.status}</span>
                        <span className="text-[10px] text-gray-400 ml-auto">{new Date(run.startedAt).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {rightPanel === 'versions' && (
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Versions</p>

              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Version Label</label>
                  <input
                    value={versionLabel}
                    onChange={e => setVersionLabel(e.target.value)}
                    placeholder="v1.0.0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Changelog</label>
                  <textarea
                    value={versionChangelog}
                    onChange={e => setVersionChangelog(e.target.value)}
                    placeholder="What changed in this version?"
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                  />
                </div>
                <button
                  onClick={saveVersion}
                  disabled={savingVersion || !versionLabel.trim()}
                  className="w-full py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  {savingVersion ? 'Saving…' : 'Save Snapshot'}
                </button>
                {versionMsg && <p className="text-xs text-emerald-600 text-center">{versionMsg}</p>}
              </div>

              {versions.length > 0 ? (
                <div className="space-y-2">
                  {versions.map(v => (
                    <div key={v.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-700">{v.version}</span>
                        <span className="text-[10px] text-gray-400">{new Date(v.createdAt).toLocaleDateString()}</span>
                      </div>
                      {v.changelog && <p className="text-[10px] text-gray-500">{v.changelog}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center py-6">No versions saved yet</p>
              )}
            </div>
          )}
        </aside>
      )}

      {/* AI Assist modal */}
      {showAiAssist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setShowAiAssist(false); setAiPreview(null); setAiError('') }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-[fadeIn_0.15s_ease]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Build with AI</h2>
                  <p className="text-[11px] text-gray-400">Generates a complete workflow from your description</p>
                </div>
              </div>
              <button onClick={() => { setShowAiAssist(false); setAiPreview(null); setAiError('') }} className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {!aiPreview ? (
              <>
                <p className="text-sm text-gray-500 mb-3">Describe what this workflow should do. AI will use your org's available skills to build it.</p>
                <textarea
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAiAssist() }}
                  placeholder="e.g. Classify customer support tickets by urgency, then route to the appropriate response skill"
                  rows={4}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none mb-3"
                />
                {aiError && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{aiError}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowAiAssist(false); setAiError('') }} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">Cancel</button>
                  <button onClick={handleAiAssist} disabled={aiLoading || !aiPrompt.trim()} className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                    {aiLoading ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Building…</> : 'Build Workflow'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 p-4 bg-violet-50 border border-violet-100 rounded-xl">
                  <p className="text-xs font-semibold text-violet-700 mb-2">AI generated {aiPreview.nodes.length} nodes — preview:</p>
                  <div className="space-y-1.5">
                    {aiPreview.nodes.map(n => (
                      <div key={n.id} className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          n.type === 'input' ? 'bg-emerald-100 text-emerald-700' :
                          n.type === 'output' ? 'bg-rose-100 text-rose-700' :
                          n.type === 'skill' ? 'bg-blue-100 text-blue-700' :
                          n.type === 'condition' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{n.type}</span>
                        <span className="text-xs text-gray-700 truncate">{(n.data as { label?: string }).label ?? n.id}</span>
                        {(n.data as { skillName?: string }).skillName && (
                          <span className="text-[10px] text-gray-400 ml-auto">→ {(n.data as { skillName?: string }).skillName}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
                  This will replace your current canvas. This action cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => { setAiPreview(null) }} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">Regenerate</button>
                  <button onClick={applyAiPreview} className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors">
                    Apply to Canvas
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
