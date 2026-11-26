import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type Org, type Skill, type Workflow } from '../lib/api'

type WorkflowType = 'orchestrator' | 'router'

export default function WorkflowBuilderPage() {
  const navigate = useNavigate()
  const [org, setOrg] = useState<Org | null>(null)
  const [step, setStep] = useState(0) // 0 = type select, 1 = select items, 2 = name+build, 3 = done

  // Type selection
  const [workflowType, setWorkflowType] = useState<WorkflowType | null>(null)

  // Orchestrator inputs
  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set())
  const [goal, setGoal] = useState('')

  // Router (supervisor) inputs
  const [orchestrators, setOrchestrators] = useState<Workflow[]>([])
  const [selectedOrchestratorIds, setSelectedOrchestratorIds] = useState<Set<string>>(new Set())
  const [description, setDescription] = useState('')

  // Shared
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState('')
  const [createdWorkflow, setCreatedWorkflow] = useState<{ id: string; name: string } | null>(null)

  const isPro = !!(org && (
    org.plan === 'pro' || org.plan === 'enterprise' ||
    (org.trialEndsAt && org.trialEndsAt > Date.now())
  ))

  useEffect(() => {
    api.me().then(({ org }) => setOrg(org)).catch(() => {})
    api.skills.list({ limit: 200 }).then(r => setSkills(r.skills)).catch(() => {})
    api.workflows.list({ type: 'orchestrator', limit: 200 }).then(r => setOrchestrators(r.workflows)).catch(() => {})
  }, [])

  function toggleSkill(id: string) {
    setSelectedSkillIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleOrchestrator(id: string) {
    setSelectedOrchestratorIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handleBuild() {
    setBuildError(''); setBuilding(true)
    try {
      let res: { workflow: { id: string; name: string } }
      if (workflowType === 'orchestrator') {
        if (selectedSkillIds.size === 0 || !goal.trim()) return
        res = await api.skillBuilder.buildOrchestrator({
          skillIds: [...selectedSkillIds],
          goal,
          name: name || `${goal.slice(0, 40)} Orchestrator`,
        })
      } else {
        if (selectedOrchestratorIds.size === 0 || !name.trim()) return
        res = await api.skillBuilder.buildSupervisor({
          orchestratorIds: [...selectedOrchestratorIds],
          name,
          description,
        })
      }
      setCreatedWorkflow(res.workflow)
      setStep(3)
    } catch (err: unknown) {
      setBuildError((err as Error).message || 'Build failed')
    } finally {
      setBuilding(false)
    }
  }

  if (!isPro) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Workflow Builder</h1>
        <p className="text-gray-500 mb-6">Workflow Builder is a Pro feature.</p>
        <Link to="/upgrade" className="px-5 py-2.5 bg-brand-600 text-white rounded-lg font-semibold hover:bg-brand-500 transition">
          Upgrade to Pro
        </Link>
      </div>
    )
  }

  // Step 0: Choose type
  if (step === 0) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Workflow Builder</h1>
        <p className="text-gray-500 mb-8">What kind of workflow do you want to build?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => { setWorkflowType('orchestrator'); setStep(1) }}
            className="text-left p-6 border-2 border-gray-200 rounded-xl hover:border-brand-500 hover:bg-brand-50 transition group"
          >
            <div className="text-2xl mb-3">⛓️</div>
            <h2 className="font-semibold text-gray-900 text-lg mb-1">Chain Skills</h2>
            <p className="text-sm text-gray-500">Pick a set of skills and describe a goal — AI wires them into a workflow.</p>
          </button>
          <button
            onClick={() => { setWorkflowType('router'); setStep(1) }}
            className="text-left p-6 border-2 border-gray-200 rounded-xl hover:border-brand-500 hover:bg-brand-50 transition group"
          >
            <div className="text-2xl mb-3">🔀</div>
            <h2 className="font-semibold text-gray-900 text-lg mb-1">Route Between Workflows</h2>
            <p className="text-sm text-gray-500">Pick existing workflows — AI builds a router that classifies requests and sends them to the right one.</p>
          </button>
        </div>
      </div>
    )
  }

  // Step 1: Select skills or orchestrators
  if (step === 1) {
    const isOrchestrator = workflowType === 'orchestrator'
    const filteredSkills = skills.filter(s =>
      !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.description?.toLowerCase().includes(search.toLowerCase())
    )
    const filteredOrchestrators = orchestrators.filter(w =>
      !search || w.name.toLowerCase().includes(search.toLowerCase())
    )
    const items = isOrchestrator ? filteredSkills : filteredOrchestrators
    const selectedIds = isOrchestrator ? selectedSkillIds : selectedOrchestratorIds
    const toggle = isOrchestrator ? toggleSkill : toggleOrchestrator

    return (
      <div className="p-8 max-w-2xl mx-auto">
        <button onClick={() => setStep(0)} className="text-sm text-gray-400 hover:text-gray-600 mb-6 flex items-center gap-1">
          ← Back
        </button>
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          {isOrchestrator ? 'Select skills to chain' : 'Select workflows to route between'}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {isOrchestrator ? 'Choose skills that work together toward your goal.' : 'Choose the orchestrator workflows this router will direct requests to.'}
        </p>
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <div className="space-y-2 max-h-96 overflow-y-auto mb-6">
          {items.map((item) => {
            const checked = selectedIds.has(item.id)
            return (
              <button
                key={item.id}
                onClick={() => toggle(item.id)}
                className={`w-full text-left p-3 rounded-lg border transition text-sm ${checked ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <span className="font-medium text-gray-900">{item.name}</span>
                {'description' in item && item.description && (
                  <span className="text-gray-400 ml-2">{(item.description as string).slice(0, 80)}</span>
                )}
              </button>
            )
          })}
          {items.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-8">
              {isOrchestrator ? 'No approved skills found. Create and approve a skill first.' : 'No orchestrators found. Build a "Chain Skills" workflow first.'}
            </p>
          )}
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">{selectedIds.size} selected</span>
          <button
            onClick={() => setStep(2)}
            disabled={selectedIds.size === 0}
            className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-brand-500 transition"
          >
            Next →
          </button>
        </div>
      </div>
    )
  }

  // Step 2: Name + build
  if (step === 2) {
    const isOrchestrator = workflowType === 'orchestrator'
    const canBuild = isOrchestrator
      ? (selectedSkillIds.size > 0 && goal.trim())
      : (selectedOrchestratorIds.size > 0 && name.trim())

    return (
      <div className="p-8 max-w-2xl mx-auto">
        <button onClick={() => setStep(1)} className="text-sm text-gray-400 hover:text-gray-600 mb-6 flex items-center gap-1">
          ← Back
        </button>
        <h1 className="text-xl font-bold text-gray-900 mb-6">
          {isOrchestrator ? 'Describe the goal' : 'Name your router'}
        </h1>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Workflow name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={isOrchestrator ? 'e.g. PR Review Pipeline' : 'e.g. Support Router'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          {isOrchestrator && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Goal <span className="text-red-400">*</span></label>
              <textarea
                value={goal}
                onChange={e => setGoal(e.target.value)}
                placeholder="Describe what this workflow should accomplish in plain English..."
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
            </div>
          )}
          {!isOrchestrator && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What kinds of requests will this router handle?"
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
            </div>
          )}
        </div>
        {buildError && <p className="text-red-500 text-sm mt-4">{buildError}</p>}
        <div className="mt-6">
          <button
            onClick={handleBuild}
            disabled={!canBuild || building}
            className="w-full px-5 py-3 bg-brand-600 text-white rounded-lg font-semibold disabled:opacity-40 hover:bg-brand-500 transition"
          >
            {building ? 'Building…' : '✨ Build with AI'}
          </button>
        </div>
      </div>
    )
  }

  // Step 3: Done
  return (
    <div className="p-8 max-w-2xl mx-auto text-center">
      <div className="text-5xl mb-4">🎉</div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Workflow built!</h1>
      <p className="text-gray-500 mb-6">Your workflow is saved as a draft. Open it in the editor to review and publish.</p>
      {createdWorkflow && (
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => navigate(`/workflows/${createdWorkflow.id}`)}
            className="px-5 py-2.5 bg-brand-600 text-white rounded-lg font-semibold hover:bg-brand-500 transition"
          >
            Open in editor
          </button>
          <Link to="/workflows" className="px-5 py-2.5 border border-gray-200 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition">
            All workflows
          </Link>
        </div>
      )}
    </div>
  )
}
