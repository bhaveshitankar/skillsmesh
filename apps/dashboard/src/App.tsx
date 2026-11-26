import { Routes, Route, Navigate } from 'react-router-dom'
import { Component, type ReactNode } from 'react'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' }
  static getDerivedStateFromError(e: Error) {
    const detail = import.meta.env.DEV ? e.message + '\n' + e.stack : ''
    return { error: detail || 'unexpected_error' }
  }
  render() {
    if (this.state.error) return (
      <div style={{ background: '#0a0a0a', color: '#f87171', fontFamily: 'monospace', padding: 32, whiteSpace: 'pre-wrap', minHeight: '100vh' }}>
        <b>Something went wrong. Please refresh the page.</b>
        {import.meta.env.DEV && this.state.error !== 'unexpected_error' && '\n\n' + this.state.error}
      </div>
    )
    return this.props.children
  }
}
import { isLoggedIn } from './lib/api'
import { isSALoggedIn } from './pages/SuperAdminLoginPage'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import JoinPage from './pages/JoinPage'
import LandingPage from './pages/LandingPage'
import SkillsPage from './pages/SkillsPage'
import SkillDetailPage from './pages/SkillDetailPage'
import CreateSkillPage from './pages/CreateSkillPage'
import ResolvePage from './pages/ResolvePage'
import PlaygroundPage from './pages/PlaygroundPage'
import MembersPage from './pages/MembersPage'
import UpgradePage from './pages/UpgradePage'
import IntegrationPage from './pages/IntegrationPage'
import BillingSuccessPage from './pages/BillingSuccessPage'
import ProfilePage from './pages/ProfilePage'
import ContactPage from './pages/ContactPage'
import SharedSkillPage from './pages/SharedSkillPage'
import LibraryPage from './pages/LibraryPage'
import SuperAdminLoginPage from './pages/SuperAdminLoginPage'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import BadgePage from './pages/BadgePage'
import ApiDocsPage from './pages/ApiDocsPage'
import ChatPage from './pages/ChatPage'
import ChatConfigPage from './pages/ChatConfigPage'
import ChatWidgetPage from './pages/ChatWidgetPage'
import WorkflowsPage from './pages/WorkflowsPage'
import WorkflowEditorPage from './pages/WorkflowEditorPage'
import SecretsPage from './pages/SecretsPage'
import SkillBuilderPage from './pages/SkillBuilderPage'
import OrchestratorBuilderPage from './pages/OrchestratorBuilderPage'
import SupervisorBuilderPage from './pages/SupervisorBuilderPage'
import WorkflowBuilderPage from './pages/WorkflowBuilderPage'
import ChatEndpointsPage from './pages/ChatEndpointsPage'

// Secret path from env — not discoverable by users (set VITE_SA_PATH in .env)
const SA_PATH = import.meta.env.VITE_SA_PATH ?? 'superadmin'

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireSA({ children }: { children: React.ReactNode }) {
  if (!isSALoggedIn()) return <Navigate to={`/${SA_PATH}`} replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ErrorBoundary><LandingPage /></ErrorBoundary>} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/s/:token" element={<SharedSkillPage />} />
      <Route path="/library" element={<LibraryPage />} />
      <Route path="/library/:slug" element={<SharedSkillPage />} />
      <Route path="/chat/:orgSlug" element={<ChatWidgetPage />} />
      <Route path="/badge" element={<BadgePage />} />
      <Route path="/api-docs" element={<ApiDocsPage />} />

      {/* Super-admin — hidden paths, no links from normal UI */}
      <Route path={`/${SA_PATH}`} element={<SuperAdminLoginPage />} />
      <Route path={`/${SA_PATH}/dashboard`} element={<RequireSA><ErrorBoundary><SuperAdminDashboard /></ErrorBoundary></RequireSA>} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="skills" element={<SkillsPage />} />
        <Route path="skills/new" element={<CreateSkillPage />} />
        <Route path="skills/:id" element={<SkillDetailPage />} />
        <Route path="resolve" element={<ResolvePage />} />
        <Route path="playground" element={<PlaygroundPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="upgrade" element={<UpgradePage />} />
        <Route path="integration" element={<IntegrationPage />} />
        <Route path="billing/success" element={<BillingSuccessPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="settings/chat" element={<ChatConfigPage />} />
        <Route path="workflows" element={<WorkflowsPage />} />
        <Route path="workflows/:id" element={<WorkflowEditorPage />} />
        <Route path="secrets" element={<SecretsPage />} />
        <Route path="skill-builder" element={<SkillBuilderPage />} />
        <Route path="workflow-builder" element={<WorkflowBuilderPage />} />
        <Route path="orchestrator-builder" element={<OrchestratorBuilderPage />} />
        <Route path="supervisor-builder" element={<SupervisorBuilderPage />} />
        <Route path="chat-endpoints" element={<ChatEndpointsPage />} />
      </Route>
    </Routes>
  )
}
