import type { EmployeeDraftInput } from '../shared/employee-contract'
import type { AgentExperience } from './agent-experience'

export const MAX_AGENT_CAPABILITIES = 30
export type AgentPurpose = 'expert' | 'coordinator' | 'business'
export const purposeLabels: Record<AgentPurpose, string> = { expert: '独立专家', coordinator: '协调 Agent', business: '业务 Agent' }
export interface GuidedSetup {
  templateId: 'knowledge' | 'analysis' | 'report' | 'review' | 'custom'
  inputDescription: string
  outputFormat: 'document' | 'table' | 'json' | 'form'
  resourceScope: 'provided' | 'selected'
  approval: 'delivery' | 'external'
  supplement: string
  promptMode: 'guided' | 'manual'
}
export interface AgentConfig extends EmployeeDraftInput {
  experience?: AgentExperience
  setup?: GuidedSetup
  contract?: AgentContract
  purpose: AgentPurpose
  owner: string
  output: string
  maxSteps: number
  timeoutSeconds: number
}
export interface ContractField {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'array'
  required: boolean
  widget?: 'textarea' | 'date' | 'select' | 'multiselect'
  options?: string[]
  help?: string
  minimum?: number
  maximum?: number
}
export interface AgentContract {
  inputFields: ContractField[]
  outputFields: ContractField[]
  followUpFields?: ContractField[]
  missingInputPolicy: 'ask' | 'reject'
  historyRequirement: 'optional' | 'required' | 'forbidden'
}
export interface AgentAsset {
  name: string
  displayDescription: string
  owner: string
  tags: string[]
  workspaceId: string
  status: 'active' | 'archived'
}
export interface GroupStep {
  id: string
  agentId: string
  task: string
  input: string
  output: string
}
export interface GroupConfig {
  setup?: GuidedSetup
  instructions?: string
  name: string
  description: string
  owner: string
  coordinatorId: string
  strategy: 'sequential'
  contextPolicy: 'previous_output' | 'shared_results'
  failurePolicy: 'stop' | 'human_review'
  maxSteps: number
  timeoutSeconds: number
  completion: string
  steps: GroupStep[]
}
export type EntityKind = 'agent' | 'group'
export type Config = AgentConfig | GroupConfig
export interface Issue { field: string; message: string }
export interface DependencyPin { agentId: string; versionId: string; name: string; purpose: AgentPurpose; config: AgentConfig }
export interface Validation {
  digest: string
  checkedAt: string
  issues: Issue[]
  warnings: string[]
  pins: DependencyPin[]
}
export interface Version<T = Config> { id: string; number: number; createdAt: string; note: string; config: T; pins: DependencyPin[] }
export interface Entity<T = Config> {
  asset?: AgentAsset
  deletedAt?: string
  id: string
  kind: EntityKind
  revision: number
  createdAt: string
  updatedAt: string
  disabled: boolean
  example: boolean
  draft: T
  activeVersionId?: string
  versions: Version<T>[]
  validation?: Validation
  blockingReasons: string[]
}
export interface AuditRecord { id: string; entityId: string; entityName: string; kind: EntityKind | 'workspace'; action: string; at: string; detail: string; actor: string }
export interface Capability {
  id: string; name: string; description: string; version: number | string
  kind?: 'skill' | 'builtin'
  tags?: string[]
  /** Usage categories, independent of Skill / Tool / MCP resource types. */
  purposes?: string[]
  imported?: { source: string; importedAt: string; status: 'ready' | 'pending-tools'; files: { path: string; content: string }[]; definition?: Record<string, unknown> }
  parameters?: { key: string; label: string; example: string }[]
  skillVersionIds: string[]; toolVersionIds: string[]; mcpVersionIds: string[]; permissionRequirements: string[]
  /** Frontend catalog metadata for the simulated invocation and confirmation policy. */
  execution?: { provider: string; versions: string[]; write: boolean; idempotent: boolean; active: boolean; departments?: string[]; input: string; output: string; action: string; toolActions?: { id: string; name: string; write: boolean; idempotent: boolean }[] }
}
export interface Workspace { name: string; owner: string }
export interface AdminState {
  campus?: import('./campus/model').CampusState
  agents: Entity<AgentConfig>[]
  deletedAgents?: Entity<AgentConfig>[]
  groups: Entity<GroupConfig>[]
  capabilities: Capability[]
  models: { modelId: string; provider: string }[]
  audits: AuditRecord[]
  workspace: Workspace
  executionConnected: false
}
export const blankAgent = (): AgentConfig => ({ name: '', role: '', description: '', systemPrompt: '', modelId: 'deepseek-v4-pro', capabilityVersionIds: [], memoryScopes: ['task'], purpose: 'expert', owner: '本地管理员', output: '', maxSteps: 10, timeoutSeconds: 120 })
export const blankGroup = (): GroupConfig => ({ name: '', description: '', owner: '本地管理员', coordinatorId: '', strategy: 'sequential', contextPolicy: 'previous_output', failurePolicy: 'human_review', maxSteps: 60, timeoutSeconds: 900, completion: '', steps: [] })
export function activeVersion<T>(entity: Entity<T>): Version<T> | undefined { return entity.versions.find(v => v.id === entity.activeVersionId) }
export function hasDraftChanges<T>(entity: Entity<T>): boolean { return JSON.stringify(entity.draft) !== JSON.stringify(activeVersion(entity)?.config) }
export function statusOf(entity: Entity): 'disabled' | 'blocked' | 'published' | 'checked' | 'draft' {
  if (entity.disabled) return 'disabled'
  if (entity.activeVersionId && entity.blockingReasons.length) return 'blocked'
  if (entity.activeVersionId) return 'published'
  if (entity.validation && !entity.validation.issues.length) return 'checked'
  return 'draft'
}
