import { contractIssues } from './agent-management'
import { validateEmployeeDraft } from '../shared/employee-contract'
import { parseConfig } from './config-validation'
import { defaultSetup, effectivePrompt, instructionIssues } from './guided-config'
import { blankAgent, type AdminState, type AgentConfig } from './shared'

export const creationSteps = ['定义工作', '准备资料', '约定交付', '设置边界', '检查并创建'] as const
export const CREATION_STORAGE_KEY = 'ai-employee-os:web-admin:agent-creation:v1'
export interface CreationIssue { field: string; message: string; step: number }
export interface CreationSession { draft: AgentConfig; step: number; reached: number; started: boolean }

export function prepareAgentDraft(draft: AgentConfig): AgentConfig {
  const goal = draft.description.trim().replace(/[\r\n\t]+/g, ' ')
  const firstSentence = goal.split(/[。！？；]/)[0]
  const role = [...(firstSentence.length >= 2 ? firstSentence : goal)].slice(0, 40).join('')
  const next = { ...draft, role, setup: { ...draft.setup!, promptMode: 'guided' as const } }
  return { ...next, systemPrompt: effectivePrompt(next) }
}

export function newCreationSession(data: AdminState): CreationSession {
  const draft = { ...blankAgent(), owner: data.workspace.owner, setup: defaultSetup('custom'), capabilityVersionIds: data.capabilities.filter(c => c.id === 'capability.text-analysis.v1').map(c => c.id) }
  return { draft: prepareAgentDraft(draft), step: 0, reached: 0, started: false }
}

export function readCreationSession(raw: string, data: AdminState): CreationSession {
  const value = JSON.parse(raw)
  if (value.schema !== 1 || !Number.isInteger(value.step) || !Number.isInteger(value.reached) || value.step < 0 || value.step > value.reached || value.reached > 4) throw new Error('invalid_creation_session')
  const draft = parseConfig('agent', value.draft) as AgentConfig
  if (!draft.setup || draft.setup.promptMode !== 'guided') throw new Error('invalid_creation_session')
  const firstInvalid = creationIssues(draft, data).find(i => i.step < value.step)
  return { draft: prepareAgentDraft(draft), step: firstInvalid?.step ?? value.step, reached: value.reached, started: true }
}

export function creationIssues(raw: AgentConfig, data: AdminState): CreationIssue[] {
  const draft = prepareAgentDraft(raw)
  const issues: CreationIssue[] = validateEmployeeDraft(draft)
    .filter(i => i.field !== 'role' && i.field !== 'systemPrompt')
    .map(i => ({ field: i.field, message: i.message.replaceAll('员工', '智能体').replaceAll('职责说明', '工作目标'), step: ['name', 'description'].includes(i.field) ? 0 : i.field === 'capabilityVersionIds' ? 1 : 3 }))
  if (!draft.setup!.inputDescription.trim()) issues.push({ field: 'inputDescription', message: '请说明每次工作需要用户提供哪些信息或材料。', step: 1 })
  if (draft.setup!.resourceScope === 'selected' && !draft.capabilityVersionIds.length) issues.push({ field: 'capabilityVersionIds', message: '请选择需要使用的能力，或改为仅使用用户提供的材料。', step: 1 })
  if (draft.capabilityVersionIds.some(id => !data.capabilities.some(c => c.id === id))) issues.push({ field: 'capabilityVersionIds', message: '有能力已不可用，请重新选择。', step: 1 })
  if (!draft.output.trim()) issues.push({ field: 'output', message: '请写明结果必须包含的内容，方便后续核对。', step: 2 })
  if (!draft.owner.trim()) issues.push({ field: 'owner', message: '请填写负责维护这个智能体的人。', step: 3 })
  if (!data.models.some(m => m.modelId === draft.modelId)) issues.push({ field: 'modelId', message: '请选择当前可用的模型。', step: 3 })
  if (!Number.isInteger(draft.maxSteps) || draft.maxSteps < 1 || draft.maxSteps > 200) issues.push({ field: 'maxSteps', message: '执行步骤需为 1–200 的整数。', step: 3 })
  if (!Number.isInteger(draft.timeoutSeconds) || draft.timeoutSeconds < 1 || draft.timeoutSeconds > 3600) issues.push({ field: 'timeoutSeconds', message: '执行时限需为 1–3600 秒的整数。', step: 3 })
  for (const issue of instructionIssues(draft)) {
    if (issue.field === 'setup.inputDescription') continue
    issues.push({ field: 'instructions', message: issue.message, step: 3 })
  }
  issues.push(...contractIssues(draft).map(issue => ({ ...issue, step: issue.field.includes('output') ? 2 : 1 })))
  return issues
}
