import { agentAvailable, expertMvpEnabled, chatExpertAvailable, multiAgentEnabled, singleAgentOnlyMessage } from './availability'
import { definitionIssues, handoffEnabled } from './agent-definition'
import { expertIssues, expertEditingConfig } from './expert-form'
import { defaultInteractionConfig, interactionOf, outputFormats, validateInteractionConfig } from './interaction-model'
import capabilitiesData from '../capabilities.json'
import { isBuiltinCapability } from '../capability-search'
import { MAX_AGENT_CAPABILITIES, type Capability } from '../shared'
import { userDirectory } from '../user-directory'
import { userAccessDecision, type UserCenterState } from '../user-center-model'
import { legacyModels, seedModelCenter, upgradeDemoModelNames, modelCenterOf, resolveAgentModel, modelAvailable, type ModelCenterState } from '../model-center'
/** Campus V1 browser prototype contract. All records and decisions are simulated. */
export type Kind = 'assistant' | 'expert' | 'team'
export type Role = 'admin' | 'configurer' | 'publisher' | 'auditor'
export interface Actor { role: Role; department: string }
export const kindLabels = { assistant: '数字助理', expert: '专家智能体', team: '专家团' }
export const roleLabels = { admin: '平台管理员', configurer: '业务配置人员', publisher: '发布授权人', auditor: '审计人员' }
export const departments = ['信息化处', '教务处', '校办公室', '教学运行科']
// Legacy organization metadata remains for old configurations; identity comes from one directory.
export const people = userDirectory.map((user, index) => ({ ...user, department: ['信息化处', '信息化处', '教务处', '校办公室', '教学运行科'][index] }))
export const models = legacyModels
/** Same catalog as the capability center; invocation rules are only a derived view. */
export const capabilityCatalog = capabilitiesData as Capability[]
export const capabilitiesOf = (state: Pick<CampusState, 'importedCapabilities'>): Capability[] => [...capabilityCatalog, ...(state.importedCapabilities ?? [])]
const toolCatalog = (catalog: Capability[]) => catalog.map(cap => ({
  id: cap.id, name: cap.name, provider: cap.execution?.provider ?? '能力中心',
  versions: cap.execution?.versions ?? [String(cap.version)], write: cap.execution?.write ?? false,
  idempotent: cap.execution?.idempotent ?? false, active: cap.execution?.active ?? false,
  departments: cap.execution?.departments ?? departments,
  input: cap.execution?.input ?? '', output: cap.execution?.output ?? '', action: cap.execution?.action ?? ''
}))
export const tools = toolCatalog(capabilityCatalog)

export interface ToolAccess { auth: 'user' | 'platform'; scope: 'user' | 'platform'; approval: string; timeout: number; retry: number; exception: string }
export interface ActionBinding extends ToolAccess { id: string; enabled: boolean }
/** tools keeps the selected capability IDs for existing browser data. Skill access belongs to actions. */
export interface Binding extends ToolAccess { id: string; version: string; read: boolean; write: boolean; actions?: ActionBinding[]; enabled?: boolean; displayName?: string; requiresConfirmation?: boolean; confirmationFields?: string[] }
export interface HumanNode { id: string; name: string; trigger: string; approver: string; tool: string }
export interface Pin { id: string; version: number; draftDigest?: string }
export interface Config {
  mode?: 'chat' | 'agent'
  definition?: import('./agent-definition').AgentDefinition
  schemaVersion?: '1.1' | '2.0'
  expert?: import('./expert-form').ExpertProfile
  promptReferences?: { id: string; label: string }[]
  interaction?: import('./interaction-model').InteractionConfig
  name: string; icon: string; duty: string; scenario?: string; department: string; owner: string; description: string; opening: string; note: string
  /** Read-only compatibility for previously saved snapshots; never a new classification. */
  business?: 'qa' | 'meeting'
  modelProviderId?: string; modelDisplayName?: string; modelProviderName?: string
  model: string; temperature: number; topP: number; maxTokens: number; streaming: boolean
  prompt: string; fewShots: { user: string; assistant: string }[]
  tools: Binding[]; nodes: HumanNode[]
  input: { types: string[]; fileMB: number; count: number; totalMB: number; audioMB: number; audioMinutes: number }
  output: { mode: 'qa' | 'task'; sources: boolean; types: string[] }
  limits: { steps: number; minutes: number; modelSeconds: number; remindHours: number; escalateDays: number }
  safety: { input: boolean; material: boolean; generation: boolean; outbound: boolean }
  team: { captain: Pin; members: Pin[]; dispatch: string; /** Deprecated team form marker; retained only for old data. */ contractVersion?: 1 }
  assistant: { exclude: string[]; candidates: number; clarify: number; noMatch: string; model: string }
  testSet: 'qa' | 'meeting'
}
export interface Grant { id: string; subject: 'department' | 'user'; target: string; children: boolean; effect: 'allow' | 'deny' }
export interface TestRound { id?: string; round: number; digest: string; passed: number; total: number; reviewer: string; at: string; failures: string[] }
export interface Snapshot { grants?: Grant[]; number: number; config: Config; tests: TestRound[]; note: string; actor: string; at: string; baseId: string }
export interface Agent { dutyType?: 'captain'; usageMode?: 'public' | 'internal'; deletedAt?: string; id: string; key?: string; kind: Kind; draft: Config; draftPending?: boolean; versions: Snapshot[]; live?: number; disabled: boolean; tests: TestRound[]; grants: Grant[]; sync: 'synced' | 'pending' | 'failed'; pending?: { digest: string; note: string; actor: string; at: string; failed?: boolean }; testHistory?: TestRound[]; rejection?: string; updated: string; updatedBy: string; credentialChecked: boolean }
export interface Run { id: string; session: string; agentId: string; version: number; user: string; department: string; model: string; goal: string; status: string; review: string; effect: string; result: string; tokens: number | null; at: string; policy: string; members: Pin[] }
export interface Audit { id: string; agentId: string; actor: string; action: string; at: string; before: string; after: string; basis: string; impact: string }
export interface CampusState { importedCapabilities?: Capability[]; modelCenter?: ModelCenterState; userCenter?: UserCenterState; managementVersion?: 2; expertCategories?: string[]; revision: number; agents: Agent[]; runs: Run[]; audits: Audit[] }
export const isCaptain = (a: Agent) => a.kind === 'expert' && a.dutyType === 'captain'
export const objectLabel = (a: Agent) => isCaptain(a) ? '队长智能体' : kindLabels[a.kind]
export const platformSkillId = (role: 'captain' | 'assistant') => `capability.campus-${role}.v1`
export const platformBinding = (role: 'captain' | 'assistant'): Binding => {
  const b = binding(platformSkillId(role))
  return { ...b, read: false, actions: skillActions(b) }
}
export function upgradeCampus(state: CampusState) {
  state.modelCenter ??= seedModelCenter()
  upgradeDemoModelNames(state.modelCenter)
  if (state.managementVersion === 2) return
  for (const a of state.agents) {
    if (a.kind === 'expert' && state.agents.some(t => t.kind === 'team' && [t.draft, ...t.versions.map(v => v.config)].some(c => c.team.captain.id === a.id))) a.dutyType = 'captain'
    a.usageMode ??= isCaptain(a) ? 'internal' : 'public'
  }
  state.managementVersion = 2
}
export function captainOwner(state: CampusState, id: string, except?: string) {
  return state.agents.find(t => !t.deletedAt && t.kind === 'team' && t.id !== except && [t.draft, ...t.versions.map(v => v.config)].some(c => c.team.captain.id === id))
}
export const clone = <T,>(value: T): T => structuredClone(value)
export const configDigest = (value: Config) => JSON.stringify(value)
export const scenarioOf = (c: Config) => c.scenario ?? (c.business === 'meeting' ? '会议管理' : '')
/** Normalize only an explicitly saved draft. Published snapshots and their test digests stay unchanged. */
export function currentConfig(c: Config): Config { const { business: _legacy, ...rest } = normalizeSkillBindings(c); return { ...rest, scenario: scenarioOf(c).trim() } }
/** Prepare editable form values only. Existing data and immutable versions change only on explicit save. */
export function editingConfig(c: Config, kind: Kind): Config {
  const result = normalizeSkillBindings(c)
  result.output.sources = true
  result.safety = { input: true, material: true, generation: true, outbound: true }
  if (kind === 'assistant') result.assistant.model = result.model
  return result
}
export function matchesGoal(goal: string, c: Config): boolean {
  const text = `${c.name} ${c.duty} ${c.description} ${scenarioOf(c)}`.toLocaleLowerCase()
  const stopWords = new Set(['请', '帮我', '需要', '完成', '一下', '进行', '处理', '关于'])
  return [...new Intl.Segmenter('zh', { granularity: 'word' }).segment(goal.toLocaleLowerCase())].some(({ segment, isWordLike }) => isWordLike && segment.length >= 2 && !stopWords.has(segment) && text.includes(segment))
}
export const evaluationSets = {
  qa: { name: '通用能力测试集 · 依据 / 权限 / 交付边界', cases: ['依据：结论与原始材料一致，缺失信息时明确说明。', '权限：只在使用人授权范围内调用工具，不扩展权限。', '交付：区分已生成结果与实际业务生效，来源可核对。', '确认：外部写操作前确认；内容变更使旧审核失效。', '异常：附件超限、缺少资料或依赖不可用时明确反馈。'], failures: ['权限：越权工具动作未被阻止', '依据：结论缺少来源关联', '确认：内容变更后未重新确认'] },
  meeting: { name: '会议场景示例集 · 会前 / 会中 / 会后 / 异常', cases: ['会前：确认目标和参会范围；发送邀请前必须人工确认。', '会中：提取结论与待办；每项事实可定位到来源。', '会后：四段式交付；未下发不得表述为业务已生效。', '异常：成员无权 / 停用 / 版本不可用时阻止运行。', '边界：附件超限明确提示；内容变更使旧审核失效。'], failures: ['异常：成员无权时仍继续执行', '会后：交付成果缺少来源关联', '会前：邀请内容变更后未重新确认'] }
}
/** Assistant examples follow reception duties; old reports and their text remain immutable. */
export function evaluationSetFor(agent: Agent, config = agent.draft) {
  return agent.kind === 'assistant' ? {
    name: '校园数字助理接待样例',
    cases: ['日常接待：按设置的身份和开场白接待师生，普通问答不发起业务操作。', '推荐专家：只推荐当前用户有权使用且可用的公开专家或专家团。', '多个选择：有多个合适对象时，让用户选择由谁继续处理。', '没有合适专家：使用已设置的反馈，说明下一步可以怎么做。', '服务不可用：告知暂时无法处理，允许稍后重试，不声称工作已完成。'],
    failures: ['推荐了当前用户无权使用的专家。', '找到多个合适专家时，没有让用户选择。', '服务不可用时，没有说明如何继续。'],
  } : evaluationSets[config.testSet] ?? evaluationSets.qa
}
export function summaryDigest(value: unknown) { let hash = 2166136261; for (const c of JSON.stringify(value)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619); return `demo-${(hash >>> 0).toString(16)}` }
export const timestamp = () => new Date().toISOString()
export const personName = (id: string) => people.find(p => p.id === id)?.name ?? id
export const liveVersion = (a: Agent) => a.versions.find(v => v.number === a.live)
export const hasChanges = (a: Agent) => !!a.draftPending || !liveVersion(a) || configDigest(a.draft) !== configDigest(liveVersion(a)!.config)
export const nextVersion = (a: Agent) => Math.max(0, ...a.versions.map(v => v.number)) + 1
export function testsPassed(a: Agent) { return a.tests.length > 0 && a.tests.every(t => t.digest === configDigest(a.draft) && t.passed === t.total && t.total > 0 && t.reviewer && !t.failures.length) }
export const statusOf = (a: Agent) => a.disabled ? '已停用' : a.pending ? '待发布确认' : a.live ? hasChanges(a) ? '已发布（有新草稿）' : '已发布' : '草稿'
export const canSee = (actor: Actor, a: Agent) => !a.deletedAt && (a.kind === 'assistant' ? actor.role === 'admin' || actor.role === 'auditor' : actor.role === 'admin' || actor.role === 'auditor' || a.draft.department === actor.department)
export const canEdit = (actor: Actor, a?: Agent) => (actor.role === 'admin' || !expertMvpEnabled && actor.role === 'configurer') && (!a || (canSee(actor, a) && (a.kind !== 'assistant' || actor.role === 'admin')))
export const canPublish = (actor: Actor, a: Agent) => canSee(actor, a) && (actor.role === 'admin' || !expertMvpEnabled && actor.role === 'publisher')
export function blankConfig(department = '信息化处'): Config { return {
  name: '', icon: '专', duty: '', scenario: '', department, owner: people.find(p => p.department === department)!.id, description: '', opening: '', note: '',
  model: 'campus-text', temperature: .3, topP: .9, maxTokens: 4096, streaming: true, prompt: '你是校内业务专家。仅依据获准资料完成 {{task.goal}}，面向 {{user.department}} 的 {{user.name}} 提供有依据的结果。缺失信息时明确说明。', fewShots: [], tools: [], nodes: [],
  input: { types: ['TXT', 'MD', 'PDF', 'DOCX'], fileMB: 20, count: 10, totalMB: 100, audioMB: 200, audioMinutes: 60 }, output: { mode: 'qa', sources: true, types: ['MD', 'DOCX'] },
  limits: { steps: 200, minutes: 60, modelSeconds: 90, remindHours: 24, escalateDays: 7 }, safety: { input: true, material: true, generation: true, outbound: true },
  team: { captain: { id: '', version: 0 }, members: [], dispatch: '队长确认目标并分派任务，成员仅在自身权限内执行，队长汇总后交付。' },
  assistant: { exclude: [], candidates: 3, clarify: 3, noMatch: '暂未找到有权使用且适合此目标的专家。请调整目标，或自行选择专家。', model: 'campus-text' }, testSet: 'qa'
} }
export const binding = (id: string, catalog = capabilityCatalog): Binding => {
  const cap = catalog.find(t => t.id === id)!
  return { id, version: cap.execution!.versions[0], read: !(cap.imported?.definition?.type === 'tool' && cap.execution?.write), write: false, auth: 'user', scope: 'user', approval: '', timeout: 10, retry: 2, exception: '' }
}
export const actionKey = (capabilityId: string, toolId: string) => `${capabilityId}::${toolId}`
export function skillActions(b: Binding, catalog = capabilityCatalog): ActionBinding[] {
  if (b.actions) return b.actions
  return (catalog.find(cap => cap.id === b.id)?.execution?.toolActions ?? []).map(action => ({
    id: action.id, enabled: action.write ? b.write : b.read, auth: b.auth, scope: b.scope,
    approval: b.approval, timeout: b.timeout, retry: action.write && !action.idempotent ? 0 : b.retry, exception: b.exception
  }))
}
/** Expand legacy package-wide permissions in an editable copy only; never mutate saved snapshots. */
export function normalizeSkillBindings(c: Config, catalog = capabilityCatalog): Config {
  const result = clone(c)
  result.tools = result.tools.map(b => {
    const cap = catalog.find(cap => cap.id === b.id)
    if (!cap || isBuiltinCapability(cap) || b.actions || !cap.execution?.toolActions) return b
    const actions = skillActions(b, catalog)
    const legacy = result.nodes.filter(node => node.tool === b.id)
    result.nodes = result.nodes.filter(node => node.tool !== b.id)
    cap.execution.toolActions.filter(action => action.write && actions.find(item => item.id === action.id)?.enabled).forEach(action => {
      legacy.forEach(node => result.nodes.push({ ...node, id: `${node.id}::${action.id}`, tool: actionKey(b.id, action.id), name: node.name.trim() ? `${action.name}前确认` : '', trigger: node.trigger.trim() ? `${action.name}之前` : '' }))
    })
    return { ...b, read: false, write: false, actions }
  })
  return result
}
export function selectCapabilities(c: Config, ids: string[], catalog = capabilityCatalog): Partial<Config> {
  const tools = ids.map(id => c.tools.find(b => b.id === id) ?? (isBuiltinCapability(catalog.find(cap => cap.id === id)!) ? binding(id, catalog) : { ...binding(id, catalog), read: false, actions: (catalog.find(cap => cap.id === id)?.execution?.toolActions ?? []).map(action => ({ ...binding(id, catalog), id: action.id, enabled: false })) }))
  const nodes = c.nodes.filter(node => !node.tool || ids.some(id => node.tool === id || node.tool.startsWith(`${id}::`)))
  const next = normalizeSkillBindings({ ...c, tools, nodes }, catalog)
  return { tools: next.tools, nodes: next.nodes }
}
export function references(state: CampusState, id: string) { return state.agents.filter(a => !a.deletedAt && a.kind === 'team' && [a.draft, ...a.versions.map(v => v.config)].some(c => [c.team.captain, ...c.team.members].some(p => p.id === id))) }
export function deletionReason(state: CampusState, a: Agent) { return a.kind === 'assistant' ? '全校唯一数字助理，保留稳定入口' : a.live || a.versions.length || a.disabled ? '仅可删除未发布的草稿，其他状态请停用保留' : state.runs.some(r => r.agentId === a.id || r.members.some(p => p.id === a.id)) ? '已有业务运行记录，须保留追溯' : references(state, a.id).filter(t => !t.deletedAt).length ? '已被专家团引用，须保留追溯' : '' }
export function usageDecision(a: Agent, userId: string, center?: UserCenterState): { allowed: boolean; reason: string } {
  if (expertMvpEnabled && !chatExpertAvailable(a)) return { allowed: false, reason: '当前仅开放单个普通专家' }
  if (!agentAvailable(a)) return { allowed: false, reason: singleAgentOnlyMessage }
  if (a.deletedAt || a.disabled) return { allowed: false, reason: '对象已停用或删除' }
  if (isCaptain(a)) return { allowed: false, reason: '队长仅随所属专家团工作' }
  if (center) {
    const access = userAccessDecision(center, userId)
    if (!access.allowed) return access
    if (!liveVersion(a)) return { allowed: false, reason: '智能体尚未发布' }
    return { allowed: true, reason: '登录后即可使用' }
  }
  if (a.kind === 'expert' && a.usageMode === 'internal') return { allowed: false, reason: multiAgentEnabled ? '仅供专家团内部使用' : '尚未开放独立使用' }
  const user = people.find(p => p.id === userId)
  const matching = a.grants.filter(g => g.subject === 'user' ? g.target === userId : g.target === user?.department || (g.children && g.target === '教务处' && user?.department === '教学运行科'))
  const denied = matching.filter(g => g.effect === 'deny')
  const chosen = denied.length ? denied : matching.filter(g => g.effect === 'allow')
  return { allowed: !denied.length && !!chosen.length, reason: chosen.length ? chosen.map(g => `${g.subject === 'user' ? personName(g.target) : g.target}${g.children ? '（含下级）' : ''}：${g.effect === 'deny' ? '明确禁止' : '允许'}`).join('；') : '无个人或部门允许授权' }
}
export function teamIssues(state: CampusState, c: Config, _user?: string, teamId?: string): string[] {
  const errors: string[] = []
  if (!c.team.captain.id) errors.push('请选择一名队长智能体')
  if (c.team.members.length < 2) errors.push('至少选择两名不同的普通专家')
  const pins = [c.team.captain, ...c.team.members]
  if (c.team.members.some(p => !p.id) || new Set(pins.filter(p => p.id).map(p => p.id)).size !== pins.filter(p => p.id).length) errors.push('队长和成员必须有效且不能重复')
  for (const pin of pins.filter(p => p.id)) {
    const a = state.agents.find(a => a.id === pin.id)
    const leader = pin.id === c.team.captain.id
    const v = pin.version === 0 && leader ? a?.draft : a?.versions.find(v => v.number === pin.version)?.config
    if (!a || a.deletedAt || a.kind !== 'expert' || a.disabled || !v) { errors.push(`${a?.draft.name ?? pin.id}：成员停用或发布版本不可用`); continue }
    if (leader && !isCaptain(a) || !leader && isCaptain(a)) errors.push(`${a.draft.name}：队长与普通专家类型不匹配`)
    if (leader && captainOwner(state, a.id, teamId ?? state.agents.find(t => t.kind === 'team' && t.draft.team === c.team)?.id)) errors.push(`${a.draft.name}：已归属其他专家团`)
    if (leader && pin.version === 0 && pin.draftDigest !== configDigest(a.draft)) errors.push('队长草稿已变化，请重新选用当前草稿并核对')
    if (leader && pin.version === 0) errors.push(...validateConfig(state, a).map(e => `队长：${e}`))
    if (!models.some(m => m.id === v.model && m.active)) errors.push(`${a.draft.name}：成员模型不可用`)
    if (a.sync !== 'synced') errors.push(`${a.draft.name}：权限同步未完成`)
    if (v.tools.some(b => !tools.find(t => t.id === b.id)?.active || !tools.find(t => t.id === b.id)?.departments.includes(v.department) || !tools.find(t => t.id === b.id)?.versions.includes(b.version))) errors.push(`${a.draft.name}：工具不可用或超出成员自身部门授权`)
  }
  return [...new Set(errors)]
}
export function validateConfig(state: CampusState, a: Agent, c = a.draft): string[] {
  if (expertMvpEnabled && chatExpertAvailable(a)) return expertMvpIssues(state, a.id, c, true)
  c = normalizeSkillBindings(c)
  const errors: string[] = []
  errors.push(...validateDraft(state, a, c))
  if (a.kind === 'team') return [...errors, ...teamIssues(state, c, undefined, a.id)]
  errors.push(...definitionIssues(c, true, isCaptain(a) ? 'captain' : 'agent').map(i => i.message))
  if (a.kind === 'expert' && c.expert) errors.push(...expertIssues(state, c, a.id, true).map(i => i.message))

  if (a.kind === 'expert' && !isCaptain(a) && c.tools.some(b => b.id.startsWith('capability.campus-'))) errors.push('普通专家不能绑定队长或数字助理的内置能力')
  if (isCaptain(a) || a.kind === 'assistant') {
    const role = isCaptain(a) ? 'captain' : 'assistant'
    if (c.tools.some(b => b.id !== platformSkillId(role))) errors.push(`${objectLabel(a)}只能使用对应的平台内置能力`)
  }
  if (!models.some(m => m.id === c.model && m.active)) errors.push('请选择可用校内模型并核对凭证引用')
  if (!c.expert && !c.prompt.trim()) errors.push('系统提示词不能为空')
  if (c.scenario !== undefined && (typeof c.scenario !== 'string' || c.scenario.length > 80)) errors.push('适用场景须为不超过 80 字的文本')
  if (!c.safety.outbound) errors.push('发送前内容安全检查不可关闭')
  const limits: [string, number, number][] = [...(isCaptain(a) ? [] : [['单文件大小', c.input.fileMB, 20], ['附件数量', c.input.count, 10], ['附件总大小', c.input.totalMB, 100], ['音频大小', c.input.audioMB, 200], ['音频时长', c.input.audioMinutes, 60]] as [string, number, number][]), ['执行步骤', c.limits.steps, 200], ['主动计算时长', c.limits.minutes, 60], ['模型超时', c.limits.modelSeconds, 120], ['提醒间隔', c.limits.remindHours, 24], ['升级通知天数', c.limits.escalateDays, 7], ['输出长度', c.maxTokens, 32768]]
  limits.forEach(([name, value, max]) => { if (!Number.isInteger(value) || value < 1 || value > max) errors.push(`${name}须为 1–${max} 的整数`) })
  if (!isCaptain(a) && !c.interaction && (!c.input.types.length || !c.output.types.length)) errors.push('至少选择一种输入和交付文件类型')
  if (!isCaptain(a) && (c.interaction ? c.interaction.input.modalities.some(t => ['image', 'audio'].includes(t)) : c.input.types.some(t => ['PNG', 'JPG', 'MP3', 'WAV', 'M4A'].includes(t))) && c.model !== 'campus-vision') errors.push('图片或音频附件需要校内多模态模型')
  if (!Number.isFinite(c.temperature) || c.temperature < 0 || c.temperature > 1 || !Number.isFinite(c.topP) || c.topP <= 0 || c.topP > 1) errors.push('模型生成参数超出可配置范围')
  errors.push(...capabilityBindingIssues(c))
  if (c.interaction && !isCaptain(a)) errors.push(...validateInteractionConfig(c.interaction, { complete: true }))
  errors.push(...resolvePromptReferences(state, c).errors)
  if (a.kind === 'assistant' && (!c.assistant.noMatch.trim() || !models.some(m => m.id === c.assistant.model && m.active) || !Number.isInteger(c.assistant.candidates) || c.assistant.candidates < 1 || c.assistant.candidates > 10 || !Number.isInteger(c.assistant.clarify) || c.assistant.clarify < 0 || c.assistant.clarify > 3)) errors.push('请核对无匹配话术、校内模型、候选数（1–10）和追问上限（0–3）')
  return [...new Set(errors)]
}
export function capabilityBindingIssues(c: Config, checkDepartments = true, catalog = capabilityCatalog): string[] {
  const tools = toolCatalog(catalog)
  const errors: string[] = []
  if (c.tools.length > MAX_AGENT_CAPABILITIES) errors.push(`最多选择 ${MAX_AGENT_CAPABILITIES} 项能力`)
  if (new Set(c.tools.map(b => b.id)).size !== c.tools.length) errors.push('能力不能重复选择')
  const validateAccess = (name: string, key: string, access: ToolAccess, write: boolean, idempotent: boolean) => {
    if (write && !c.nodes.some(n => n.tool === key && n.name.trim() && n.trigger.trim() && n.approver)) errors.push(`${name}：写动作须绑定完整的前置人工确认节点`)
    if (write && !idempotent && access.retry !== 0) errors.push(`${name}：无幂等保障，写动作必须关闭自动重试`)
    if ((access.timeout > 10 || access.retry > 2) && !access.exception.trim()) errors.push(`${name}：超时 / 重试放宽须登记显式例外`)
    if (!Number.isInteger(access.timeout) || access.timeout < 1 || !Number.isInteger(access.retry) || access.retry < 0) errors.push(`${name}：超时 / 重试格式不正确`)
    if (access.scope === 'platform' && !access.approval.trim()) errors.push(`${name}：平台身份须登记管理员批准依据`)
  }
  c.tools.forEach(b => {
    const tool = tools.find(t => t.id === b.id)
    const cap = catalog.find(cap => cap.id === b.id)
    if (!tool?.active || !tool.versions.includes(b.version)) errors.push(`${tool?.name ?? b.id}：能力已停用或版本不可用`)
    if (checkDepartments && !tool?.departments.includes(c.department)) errors.push(`${tool?.name ?? b.id}：所属部门无绑定权限`)
    if (b.enabled === false) return
    if (cap?.imported?.definition?.type === 'tool' && cap.execution?.write && b.read) errors.push(`${cap.name}：此工具是写操作，须启用写入并配置执行前确认`)
    if (b.requiresConfirmation && !b.write && !c.nodes.some(n => n.tool === b.id && n.name.trim() && n.trigger.trim() && n.approver)) errors.push(`${tool?.name}：请补齐执行前确认`)
    if (b.confirmationFields !== undefined && (new Set(b.confirmationFields).size !== b.confirmationFields.length || b.confirmationFields.some(key => !cap?.parameters?.some(p => p.key === key)) || (b.write || b.requiresConfirmation) && !b.confirmationFields.length)) errors.push(`${tool?.name}：请至少选择一个有效的确认展示字段`)
    if (cap && !isBuiltinCapability(cap)) {
      const definitions = cap.execution?.toolActions
      if (!definitions || definitions.length !== cap.toolVersionIds.length || definitions.some(action => !cap.toolVersionIds.includes(action.id))) { errors.push(`${cap.name}：所需工具的调用规则待确认`); return }
      const actions = skillActions(b, catalog)
      for (const definition of definitions) {
        const dependency = definition as typeof definition & { required?: boolean; active?: boolean }
        if (dependency.required && !actions.some(action => action.id === definition.id && action.enabled)) errors.push(`${cap.name}：必需工具「${definition.name}」未启用`)
        if (dependency.active === false && actions.some(action => action.id === definition.id && action.enabled)) errors.push(`${definition.name}：工具已停用`)
      }
      const mcpService = (cap.execution as { mcpService?: { connection: string } })?.mcpService
      if (mcpService?.connection === 'unavailable') errors.push(`${cap.name}：MCP 服务不可用`)
      if (mcpService && !actions.some(action => action.enabled)) errors.push(`${cap.name}：请至少启用一个 MCP 操作`)
      if (new Set(actions.map(action => action.id)).size !== actions.length || actions.length !== definitions.length || actions.some(action => !definitions.some(definition => definition.id === action.id))) errors.push(`${cap.name}：工具配置缺失、重复或已不可用`)
      actions.filter(action => action.enabled).forEach(action => {
        const definition = definitions.find(item => item.id === action.id)
        if (definition) validateAccess(definition.name, actionKey(b.id, action.id), action, definition.write, definition.idempotent)
      })
      return
    }
    if (!b.read && !b.write) errors.push(`${tool?.name}：至少选择一个动作`)
    if (b.write && !tool?.write) errors.push(`${tool?.name}：不提供写动作`)
    validateAccess(tool?.name ?? b.id, b.id, b, b.write, !!tool?.idempotent)
  })
  return [...new Set(errors)]
}
export function publishIssues(state: CampusState, a: Agent, actor: Actor) {
  return [...releaseIssues(state, a), ...(!canPublish(actor, a) ? ['当前身份没有独立发布权限'] : [])]
}
export function releaseIssues(state: CampusState, a: Agent) {
  return [...validateConfig(state, a), ...(a.live && !a.disabled && !hasChanges(a) ? ['当前配置已发布，无需重复发布'] : []),
    ...(isCaptain(a) ? ['队长须随所属专家团发布'] : []),
    ...(!state.userCenter && a.sync !== 'synced' ? ['使用授权尚未同步，请重试同步'] : []),
    ...(!expertMvpEnabled && !a.credentialChecked && a.kind !== 'team' ? ['复制后须重新核对模型凭证引用'] : [])]
}

/** Incomplete business configuration can be saved. Only malformed fields block saving. */
export function validateDraft(state: CampusState, a: Agent, c = a.draft): string[] {
  if (expertMvpEnabled && chatExpertAvailable(a)) return expertMvpIssues(state, a.id, c, false)
  const errors: string[] = a.kind === 'team' ? [] : definitionIssues(c, false, isCaptain(a) ? 'captain' : 'agent').map(i => i.message)
  if (a.kind !== 'team' && c.definition && handoffEnabled(c.definition) && c.definition.governance.handoffOwner && !people.some(p => p.id === c.definition!.governance.handoffOwner)) errors.push('请选择有效的人工接管人员')
  if (a.kind === 'expert' && c.expert) errors.push(...expertIssues(state, c, a.id, false).map(i => i.message))
  if ((a.kind === 'team' || !c.expert) && (!c.name.trim() || c.name.length > 100)) errors.push('名称必填，且不超过 100 字')
  if (c.scenario !== undefined && (typeof c.scenario !== 'string' || c.scenario.length > 80)) errors.push('适用场景须为不超过 80 字的文本')
  if (c.interaction && a.kind !== 'team' && !isCaptain(a)) errors.push(...validateInteractionConfig(c.interaction))
  if (c.description.length > 500) errors.push('简介不能超过 500 字')
  if (a.kind !== 'team' && c.prompt.length > 20000) errors.push('提示词不能超过 20000 字')
  if ((a.kind === 'team' || !c.expert) && state.agents.some(other => !other.deletedAt && other.id !== a.id && other.draft.department === c.department && other.draft.name.trim() === c.name.trim())) errors.push('名称在所属部门内必须唯一')
  if (!people.some(p => p.id === c.owner && p.department === c.department)) errors.push('责任人必须属于所选部门')
  if (a.kind === 'team') return errors
  for (const [key, max] of Object.entries({ steps: 200, minutes: 60, modelSeconds: 120, remindHours: 24, escalateDays: 7 })) { const value = c.limits[key as keyof Config['limits']]; if (!Number.isInteger(value) || value < 1 || value > max) errors.push(`执行限制 ${key} 须为 1—${max} 的整数`) }
  if (c.tools.length > MAX_AGENT_CAPABILITIES || new Set(c.tools.map(b => b.id)).size !== c.tools.length) errors.push('能力选择重复或超过上限')
  return errors
}

export function resolvePromptReferences(state: CampusState, c: Config): { ids: string[]; errors: string[] } {
  let text = c.prompt
  const ids = new Set<string>(); const errors: string[] = []
  const labels = [...new Set([...(c.promptReferences ?? []).map(r => r.label), ...state.agents.filter(a => a.kind === 'expert').map(a => a.draft.name)])].sort((a, b) => b.length - a.length)
  for (const label of labels) {
    if (!label || !text.includes(`@${label}`)) continue
    const known = (c.promptReferences ?? []).filter(r => r.label === label)
    const candidates = known.length ? known.map(r => state.agents.find(a => a.id === r.id)).filter((a): a is Agent => !!a) : state.agents.filter(a => a.kind === 'expert' && a.draft.name === label)
    if (candidates.length === 1 && candidates[0].kind === 'expert') ids.add(candidates[0].id)
    else errors.push(`@${label}：引用不存在或有重名，请重新选择专家`)
    text = text.split(`@${label}`).join(' ')
  }
  for (const token of text.match(/@[^\s，。；：、,.;:!?！？()[\]{}]+/g) ?? []) errors.push(`${token}：无法识别该专家，请从队长的成员分工中选择，或改成普通文字说明`)
  return { ids: [...ids], errors }
}
export function teamPromptIssues(state: CampusState, c: Config): string[] {
  const leader = state.agents.find(a => a.id === c.team.captain.id)?.versions.find(v => v.number === c.team.captain.version)
  if (!leader) return []
  const refs = resolvePromptReferences(state, leader.config)
  const members = c.team.members.map(p => p.id).filter(Boolean)
  return [...refs.errors, ...refs.ids.filter(id => id !== c.team.captain.id && !members.includes(id)).map(id => `队长提示词引用了未选择的专家：${state.agents.find(a => a.id === id)?.draft.name ?? id}`)]
}
/** Normalize editable values on explicit save; keep capability bindings and published history. */
export function expertMvpConfig(c: Config): Config {
  const next = normalizeSkillBindings(c)
  next.interaction ??= expertEditingConfig(next, { revision: 0, agents: [], runs: [], audits: [] }).interaction
  // The preceding pure-chat prototype used zero as an attachment sentinel.
  if (next.mode === 'chat' && next.interaction!.input.attachments.count === 0) next.interaction!.input.attachments.count = defaultInteractionConfig().input.attachments.count
  next.mode = 'agent'; next.schemaVersion = '2.0'
  next.name = next.name.trim(); next.description = next.description.trim(); next.prompt = next.prompt.trim(); next.opening = next.opening.trim()
  if (next.expert) next.expert.questions = next.expert.questions.map(q => q.trim()).filter(Boolean)
  const io = next.interaction!
  const files: Record<string, string[]> = { text: ['TXT', 'MD'], document: ['PDF', 'DOCX'], spreadsheet: ['XLSX', 'CSV'], image: ['PNG', 'JPG'], audio: ['MP3', 'WAV', 'M4A'] }
  next.input = { ...io.input.attachments, types: [...new Set(io.input.modalities.flatMap(m => files[m] ?? []))] }
  const formats: Record<string, string[]> = { text: ['TXT'], markdown: ['MD'], document: ['DOCX'], pdf: ['PDF'], table: ['CSV'], json: ['JSON'] }
  next.output = { mode: ['text', 'markdown'].includes(io.output.format) ? 'qa' : 'task', sources: io.output.sourceRequired, types: [...new Set(outputFormats(io.output).flatMap(f => formats[f] ?? []))] }
  return next
}
export function expertMvpIssues(state: CampusState, id: string, c: Config, complete: boolean): string[] {
  const errors: string[] = []
  if (c.name.trim().length < 2 || c.name.trim().length > 20) errors.push('专家名称须为 2–20 字')
  if (state.agents.some(a => !a.deletedAt && a.id !== id && chatExpertAvailable(a) && a.draft.name.trim() === c.name.trim())) errors.push('专家名称已存在，请换一个名称')
  if (c.description.length > 200 || complete && !c.description.trim()) errors.push('请填写不超过 200 字的专家简介')
  if (c.prompt.length > 8000 || complete && !c.prompt.trim()) errors.push('请填写不超过 8000 字的系统提示词')
  if (c.opening.length > 200) errors.push('开场白不能超过 200 字')
  if ((c.expert?.questions.filter(q => q.trim()).length ?? 0) > 4 || c.expert?.questions.some(q => q.length > 80)) errors.push('推荐问题最多 4 条，每条不超过 80 字')
  const selectedModel = resolveAgentModel(state, c)
  if (complete && !modelAvailable(modelCenterOf(state), selectedModel)) errors.push('请选择模型管理中已启用且可用的模型')
  if (!Number.isFinite(c.temperature) || c.temperature < 0 || c.temperature > 1 || !Number.isFinite(c.topP) || c.topP <= 0 || c.topP > 1) errors.push('模型生成参数超出可配置范围')
  if (!Number.isInteger(c.maxTokens) || c.maxTokens < 1 || c.maxTokens > 32768) errors.push('最大输出 Token 须为 1–32768 的整数')
  if (!Number.isInteger(c.limits.modelSeconds) || c.limits.modelSeconds < 1 || c.limits.modelSeconds > 120) errors.push('模型响应超时须为 1–120 秒')
  const effective = expertMvpConfig(c)
  errors.push(...validateInteractionConfig(effective.interaction!, { complete, formatsOnly: true }))
  if (complete && effective.interaction!.input.modalities.some(m => ['image', 'audio'].includes(m) && !selectedModel?.inputTypes.includes(m as 'image' | 'audio'))) errors.push('图片或音频输入需要选择支持相应输入的多模态模型')
  if (complete && c.tools.some(tool => tool.enabled !== false) && !selectedModel?.supportsTools) errors.push('已配置执行能力，请选择支持工具调用的模型')
  if (c.tools.length > MAX_AGENT_CAPABILITIES || new Set(c.tools.map(b => b.id)).size !== c.tools.length) errors.push('能力选择重复或超过上限')
  if (c.tools.some(b => b.id.startsWith('capability.campus-'))) errors.push('普通专家不能绑定队长或数字助理的内置能力')
  if (complete) errors.push(...capabilityBindingIssues(effective, false, capabilitiesOf(state)))
  return [...new Set(errors)]
}

/** Normalize new team writes only. Legacy snapshots and source experts are never changed. */
export function managedConfig(c: Config, kind: Kind): Config {
  if (expertMvpEnabled && kind === 'expert') return expertMvpConfig(c)
  const next = currentConfig(c)
  if (kind === 'expert' && next.expert) {
    next.name = next.name.trim(); next.description = next.description.trim()
    next.interaction = expertEditingConfig(next, { revision: 0, agents: [], runs: [], audits: [] }).interaction
  }
  if (kind !== 'team') return { ...next, schemaVersion: c.schemaVersion ?? '1.1' }
  const defaults = blankConfig(c.department)
  // Preserve old team-owned fields as inert compatibility data; never derive or copy member contracts.
  return { ...defaults, schemaVersion: c.schemaVersion ?? '1.1', ...(c.interaction ? { interaction: clone(c.interaction) } : {}), ...(c.definition ? { definition: clone(c.definition) } : {}), input: clone(c.input), output: clone(c.output), name: c.name, description: c.description, duty: '', scenario: c.scenario,
    department: c.department, owner: c.owner, icon: '团', prompt: '', model: '', tools: [], nodes: [],
    team: { ...clone(c.team), dispatch: '' } }
}

export function seedCampus(): CampusState {
  const state: CampusState = { revision: 1, agents: [], runs: [], audits: [] }
  const make = (id: string, kind: Kind, name: string, duty: string, department: string, published = true) => {
    const c = { ...blankConfig(department), name, duty, prompt: `你负责${duty}。信息缺失时先追问，明确依据后交付结果。`, description: duty, icon: kind === 'assistant' ? '助' : kind === 'team' ? '团' : name.slice(0, 1) }
    if (id.includes('meeting') || ['captain', 'minutes', 'schedule'].includes(id)) { c.scenario = '会议管理'; c.testSet = 'meeting'; c.output.mode = 'task'; c.limits.modelSeconds = 120 }
    else if (id === 'policy') c.scenario = '政策咨询'
    else if (id === 'old-office') c.scenario = '办公制度咨询'
    const a: Agent = { id, kind, draft: c, versions: [], disabled: false, tests: [], grants: [{ id: `${id}-grant`, subject: 'department', target: '信息化处', children: false, effect: 'allow' }], sync: 'synced', updated: timestamp(), updatedBy: '平台管理员', credentialChecked: true }
    if (published) { a.tests = [1, 2, 3].map(round => ({ round, digest: configDigest(c), passed: 100, total: 100, reviewer: '林晓（示例）', at: timestamp(), failures: [] })); a.versions = [{ number: 1, config: clone(c), tests: clone(a.tests), note: '预置演示版本，非真实底座发布', actor: '平台管理员（示例）', at: timestamp(), baseId: `demo-base-${id}-v1` }]; a.live = 1 }
    state.agents.push(a); return a
  }
  make('assistant', 'assistant', '校园数字助理', '理解教职工目标，在权限范围内匹配专家与专家团', '信息化处')
  make('captain', 'expert', '会议统筹专家', '梳理会议目标，组织会前、会中与会后的协作交付', '信息化处')
  make('schedule', 'expert', '会议安排专家', '核对参会人及时间，确认后发送会议邀请', '信息化处')
  make('minutes', 'expert', '会议纪要专家', '从会议材料提取结论、决议与待办，并关联来源', '信息化处')
  const captain = state.agents.find(a => a.id === 'captain')!
  captain.draft.prompt = '负责会议筹备与统一交付。先由 @会议安排专家 核对参与人和时间，再由 @会议纪要专家 整理资料与纪要；队长核对冲突、追问缺失信息，并在外部动作前确认。'
  captain.draft.promptReferences = [{ id: 'schedule', label: '会议安排专家' }, { id: 'minutes', label: '会议纪要专家' }]
  captain.versions[0].config = clone(captain.draft)
  captain.tests.forEach(t => { t.digest = configDigest(captain.draft) })
  const team = make('meeting-team', 'team', '会议全流程专家团', '统筹会议安排、纪要整理和任务跟进', '信息化处')
  team.draft.team.captain = { id: 'captain', version: 1 }; team.draft.team.members = [{ id: 'schedule', version: 1 }, { id: 'minutes', version: 1 }]
  team.tests.forEach(t => { t.digest = configDigest(team.draft) }); team.versions[0].config = clone(team.draft); team.versions[0].tests = clone(team.tests)
  make('policy', 'expert', '教务政策解读专家', '解释教务政策与适用条件，标注原文依据', '教务处', false)
  make('meeting-review', 'expert', '会议材料核对专家', '核对议程与材料完整性，列出缺失项', '校办公室', false)
  const disabled = make('old-office', 'expert', '办公制度问答专家', '提供校内办公制度与办理指引', '校办公室'); disabled.disabled = true
  const incomplete = make('unfinished-team', 'team', '筹备中的专家团', '待选择队长与成员', '信息化处', false)
  incomplete.draft = managedConfig(incomplete.draft, 'team')
  const update = clone(captain.versions[0]); update.number = 2; update.config.prompt += ' 交付前补充检查所有待办是否有负责人。'; update.note = '调度说明更新示例'; update.tests = []; captain.versions.unshift(update); captain.live = 2; captain.draft = clone(update.config); captain.tests = []
  const today = timestamp()
  state.runs = [
    { id: 'demo-task-1001', session: 'demo-session-41', agentId: 'meeting-team', version: 1, user: 'lin', department: '信息化处', model: 'campus-text', goal: '安排本周数字校园建设例会', status: '等待人工', review: '待确认', effect: '未生效', result: '邀请草稿已生成，等待发起人确认接收范围', tokens: 12840, at: today, policy: 'demo-policy-v1', members: clone(team.draft.team.members) },
    { id: 'demo-task-1002', session: 'demo-session-42', agentId: 'minutes', version: 1, user: 'chen', department: '信息化处', model: 'campus-text', goal: '整理项目推进会议纪要', status: '完成', review: '已通过', effect: '未下发', result: '已生成纪要与 4 项待办；尚未下发', tokens: 8260, at: today, policy: 'demo-policy-v1', members: [] },
    { id: 'demo-task-1003', session: 'demo-session-43', agentId: 'assistant', version: 1, user: 'lin', department: '信息化处', model: 'campus-text', goal: '查询可用的会议专家', status: '完成', review: '无需审核', effect: '无外部操作', result: '已展示两个可选专家', tokens: 940, at: today, policy: 'demo-policy-v1', members: [] },
    { id: 'demo-task-1004', session: 'demo-session-44', agentId: 'meeting-team', version: 1, user: 'chen', department: '信息化处', model: 'campus-text', goal: '补充会议结论与行动项', status: '部分完成', review: '待复核', effect: '未生效', result: '已提取结论，参会人名单缺失，待补充', tokens: null, at: today, policy: 'demo-policy-v1', members: clone(team.draft.team.members) }
  ]
  upgradeCampus(state)
  return state
}
