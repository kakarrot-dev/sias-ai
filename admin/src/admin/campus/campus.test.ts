import { describe, expect, it, vi } from 'vitest'

// Retain coverage for the dormant multi-agent workflows. Current default scope is
// verified without this override in single-agent-scope.test.tsx.
vi.mock('./availability', async original => ({ ...await original<typeof import('./availability')>(), multiAgentEnabled: true, expertMvpEnabled: false, agentAvailable: () => true }))
import { PrototypeStore, STORAGE_KEY } from '../prototype-store'
import { actionKey, binding, blankConfig, capabilityCatalog, clone, configDigest, editingConfig, hasChanges, kindLabels, liveVersion, matchesGoal, scenarioOf, seedCampus, teamIssues, testsPassed, usageDecision, validateConfig, type Actor, type CampusState } from './model'
import { applyCampusAction, type CampusAction } from './actions'

const admin: Actor = { role: 'admin', department: '信息化处' }
function setup() {
  const state = seedCampus()
  const run = (action: CampusAction, actor = admin) => applyCampusAction(state, actor, action)
  const test = (id: string) => [1, 2, 3].forEach(round => run({ type: 'test', id, round, pass: true, reviewer: '林晓' }))
  return { state, run, test }
}
describe('高校 V1 原型约束', () => {
  it('expands legacy Skill access and confirmations only on saving without rewriting published versions', () => {
    const { state, run } = setup(); const a = state.agents.find(a => a.id === 'minutes')!
    const id = 'capability.feishu-meetings.v2'
    a.draft.tools = [{ ...binding(id), write: true, retry: 0, scope: 'platform', approval: '原有批准依据' }]
    a.draft.nodes = [{ id: 'legacy', tool: id, name: '办理确认', trigger: '办理前', approver: '发起人指定' }]
    a.versions[0].config = clone(a.draft)
    const before = clone(a)
    const config = editingConfig(a.draft, a.kind)
    expect(a).toEqual(before)
    expect(config.tools[0].actions).toHaveLength(3)
    expect(config.tools[0].actions?.every(action => action.enabled && action.approval === '原有批准依据')).toBe(true)
    expect(config.nodes).toHaveLength(2)
    expect(config.nodes.every(node => node.approver === '发起人指定' && node.tool.startsWith(`${id}::`))).toBe(true)
    run({ type: 'save', id: a.id, config, credentialChecked: true })
    expect(a.versions).toEqual(before.versions); expect(a.tests).toEqual([])
    expect(editingConfig(a.draft, a.kind)).toEqual(a.draft)
  })
  it('requires approval and no retry for each enabled Skill write tool independently', () => {
    const { state } = setup(); const a = state.agents.find(a => a.id === 'minutes')!
    const c = editingConfig({ ...a.draft, tools: [binding('capability.feishu-meetings.v2')] }, a.kind)
    const skill = c.tools[0]; const create = skill.actions![1]; const send = skill.actions![2]
    create.enabled = true; send.enabled = true
    c.nodes = [{ id: 'create-confirm', tool: actionKey(skill.id, create.id), name: '创建确认', trigger: '创建前', approver: '发起人' }]
    expect(validateConfig(state, a, c).join()).toContain('发送会议邀请：写动作须绑定')
    c.nodes.push({ ...c.nodes[0], id: 'send-confirm', tool: actionKey(skill.id, send.id) })
    send.retry = 1; send.scope = 'platform'
    expect(validateConfig(state, a, c).join()).toContain('发送会议邀请：无幂等保障')
    expect(validateConfig(state, a, c).join()).toContain('发送会议邀请：平台身份')
    send.retry = 0; send.approval = '管理员批准依据'
    expect(validateConfig(state, a, c)).toEqual([])
    skill.actions!.push({ ...send })
    expect(validateConfig(state, a, c).join()).toContain('工具配置缺失、重复或已不可用')
  })
  it('describes every Skill tool using the existing versioned dependency IDs', () => {
    for (const cap of capabilityCatalog.filter(cap => cap.kind === 'skill')) {
      expect(cap.execution?.toolActions?.map(action => action.id)).toEqual(cap.toolVersionIds)
    }
  })
  it('prepares simplified defaults without changing stored drafts or published versions before save', () => {
    const { state, run } = setup(); const a = state.agents.find(a => a.id === 'assistant')!
    a.draft.output.sources = false; a.draft.safety.input = false; a.draft.assistant.model = 'campus-vision'
    a.draft.input.fileMB = 8; a.draft.limits.modelSeconds = 65; a.draft.temperature = .7
    a.draft.fewShots = [{ user: '资料缺失怎么办', assistant: '明确列出缺失内容' }]
    const stored = clone(a.draft); const versions = clone(a.versions)
    const form = editingConfig(a.draft, a.kind)
    expect(a.draft).toEqual(stored); expect(a.versions).toEqual(versions)
    expect(form.output.sources).toBe(true); expect(Object.values(form.safety).every(Boolean)).toBe(true)
    expect(form.assistant.model).toBe(form.model)
    run({ type: 'save', id: a.id, config: form, credentialChecked: true })
    expect(a.draft.input.fileMB).toBe(8); expect(a.draft.limits.modelSeconds).toBe(65); expect(a.draft.temperature).toBe(.7)
    expect(a.draft.fewShots).toEqual(stored.fewShots); expect(a.tests).toEqual([]); expect(a.versions).toEqual(versions)
  })
  it('reads legacy meeting values as scenario text and never rewrites published snapshots', () => {
    const { state, run } = setup(); const a = state.agents.find(a => a.id === 'schedule')!
    delete a.draft.scenario; a.draft.business = 'meeting'
    a.tests.forEach(t => { t.digest = configDigest(a.draft) }); a.versions[0].config = clone(a.draft); a.versions[0].tests = clone(a.tests)
    const previous = clone(a.versions)
    expect(scenarioOf(a.draft)).toBe('会议管理'); expect(testsPassed(a)).toBe(true)
    run({ type: 'save', id: a.id, config: { ...a.draft, note: '更新说明' }, credentialChecked: true })
    expect(a.draft.business).toBeUndefined(); expect(a.draft.scenario).toBe('会议管理'); expect(a.tests).toEqual([])
    expect(a.versions).toEqual(previous)
  })
  it('matches non-meeting goals using responsibilities instead of defaulting every goal to QA', () => {
    const c = { ...blankConfig(), name: '报销材料专家', duty: '核对票据与报销凭证', scenario: '报销审核' }
    expect(matchesGoal('请核对报销票据', c)).toBe(true)
    expect(matchesGoal('请安排校车', c)).toBe(false)
    expect(blankConfig()).not.toHaveProperty('business')
  })
  it('draft changes retain historical tests without requiring a report for publication; published and running versions stay frozen', () => {
    const { state, run } = setup(); const a = state.agents.find(a => a.id === 'minutes')!; const original = clone(liveVersion(a)); const runBefore = clone(state.runs)
    run({ type: 'save', id: a.id, config: { ...a.draft, duty: '核对会议决议及来源，输出待办' }, credentialChecked: true })
    expect(hasChanges(a)).toBe(true); expect(testsPassed(a)).toBe(false); expect(liveVersion(a)).toEqual(original)
    expect(a.tests).toEqual([]); expect(a.testHistory?.length).toBeGreaterThan(0)
    run({ type: 'publish', id: a.id, note: '增加来源核验' }); expect(a.live).toBe(2); expect(state.runs).toEqual(runBefore)
    run({ type: 'rollback', id: a.id, version: 1, note: '回退演示' }); expect(a.live).toBe(1); expect(a.draft.duty).toContain('核对会议决议'); expect(state.runs).toEqual(runBefore)
  })
  it('reports only current nonempty successful simulations as passed without requiring three rounds', () => {
    const { state, run } = setup(); const a = state.agents.find(a => a.id === 'policy')!
    expect(() => run({ type: 'test', id: a.id, round: 1, pass: true, reviewer: '' })).toThrow('复核人')
    expect(testsPassed(a)).toBe(false)
    run({ type: 'test', id: a.id, round: 1, pass: true, reviewer: '周宁' }); expect(testsPassed(a)).toBe(true)
    run({ type: 'test', id: a.id, round: 2, pass: false, reviewer: '周宁' }); run({ type: 'test', id: a.id, round: 3, pass: true, reviewer: '周宁' }); expect(testsPassed(a)).toBe(false)
    expect(a.tests.find(t => t.round === 2)?.failures).toHaveLength(3)
    run({ type: 'test', id: a.id, round: 2, pass: true, reviewer: '周宁' }); expect(testsPassed(a)).toBe(true)
  })
  it('separates department configuration rights and independent publishing rights', () => {
    const { state, run, test } = setup(); const a = state.agents.find(a => a.id === 'policy')!
    expect(() => run({ type: 'save', id: a.id, config: a.draft, credentialChecked: true }, { role: 'configurer', department: '信息化处' })).toThrow('无权')
    run({ type: 'save', id: a.id, config: { ...a.draft, duty: '解释教务政策适用条件' }, credentialChecked: true }, { role: 'configurer', department: '教务处' })
    test(a.id); expect(() => run({ type: 'publish', id: a.id, note: '发布' }, { role: 'configurer', department: '教务处' })).toThrow('发布权限')
    run({ type: 'request', id: a.id, note: '请求发布' }, { role: 'configurer', department: '教务处' })
    run({ type: 'publish', id: a.id, note: '发布' }, { role: 'publisher', department: '教务处' }); expect(a.live).toBe(1)
    expect(() => run({ type: 'save', id: a.id, config: a.draft, credentialChecked: true }, { role: 'publisher', department: '教务处' })).toThrow('配置')
  })
  it('enforces singleton assistants and preserves read-only object type after creation', () => {
    const { state, run } = setup(); expect(Object.keys(kindLabels)).toHaveLength(3)
    expect(() => run({ type: 'create', kind: 'assistant', config: { ...blankConfig(), name: '另一助理', duty: '匹配目标' } })).toThrow('一个数字助理')
    expect(() => run({ type: 'delete', id: 'assistant' })).toThrow('全校唯一数字助理')
    expect(() => run({ type: 'copy', id: 'assistant', name: '助理副本' })).toThrow('不可复制')
    expect(() => run({ type: 'disable', ids: ['assistant'], policy: 'pause', note: '停用检查' })).toThrow('不能停用')
    const id = run({ type: 'create', kind: 'team', config: { ...blankConfig(), name: '新专家团', duty: '解决明确业务问题' } })
    expect(state.agents.find(a => a.id === id)?.kind).toBe('team')
  })
  it('blocks side-effect writes without a human node and retries without idempotency', () => {
    const { state } = setup(); const a = state.agents.find(a => a.id === 'schedule')!; const c = clone(a.draft)
    c.tools = [{ ...binding('notice'), write: true }]
    expect(validateConfig(state, a, c).join()).toContain('前置人工确认节点'); expect(validateConfig(state, a, c).join()).toContain('关闭自动重试')
    c.tools[0].retry = 0; c.nodes = [{ id: 'n1', name: '发送前确认', trigger: '发送之前', approver: '发起人', tool: 'notice' }]
    expect(validateConfig(state, a, c)).toEqual([])
    c.tools[0].scope = 'platform'; expect(validateConfig(state, a, c).join()).toContain('批准依据')
  })
  it('validates Skill versions, duplicate selections and write confirmation from the shared catalog', () => {
    const { state } = setup(); const a = state.agents.find(a => a.id === 'minutes')!; const c = clone(a.draft)
    const skill = binding('capability.feishu-meetings.v2')
    c.tools = [{ ...skill, write: true, retry: 0 }]
    expect(validateConfig(state, a, c).join()).toContain('前置人工确认节点')
    c.nodes = [{ id: 'skill-confirm', tool: skill.id, name: '办理前确认', trigger: '创建或发送之前', approver: '发起人' }]
    expect(validateConfig(state, a, c)).toEqual([])
    c.tools[0].version = 'missing'; expect(validateConfig(state, a, c).join()).toContain('版本不可用')
    c.tools = [skill, skill]; expect(validateConfig(state, a, c).join()).toContain('不能重复')
    c.tools = [{ ...skill, id: 'removed-capability' }]; expect(validateConfig(state, a, c).join()).toContain('版本不可用')
  })
  it('enforces attachment hard limits, model modality and an independent model timeout', () => {
    const { state } = setup(); const a = state.agents.find(a => a.id === 'policy')!; const c = clone(a.draft)
    c.input.fileMB = 21; c.input.count = 11; c.limits.modelSeconds = 121; c.input.types = ['PNG']
    const errors = validateConfig(state, a, c).join(); expect(errors).toContain('单文件大小'); expect(errors).toContain('附件数量'); expect(errors).toContain('模型超时'); expect(errors).toContain('多模态模型')
  })
  it('pins only unique published experts, with at most three members and a captain', () => {
    const { state } = setup(); const a = state.agents.find(a => a.id === 'meeting-team')!; const c = clone(a.draft)
    c.team.members = [{ id: 'captain', version: 1 }]; expect(teamIssues(state, c).join()).toContain('不能重复')
    c.team.members = [{ id: a.id, version: 1 }]; expect(teamIssues(state, c).join()).toContain('不可用')
    c.team.members = [{ id: 'policy', version: 1 }]; expect(teamIssues(state, c).join()).toContain('不可用')
    c.team.members = Array.from({ length: 4 }, () => ({ id: 'minutes', version: 1 })); expect(teamIssues(state, c).join()).toContain('不能重复')
  })
  it('blocks disabled dependencies and unauthorized team members; stopping a member pauses affected work', () => {
    const { state, run } = setup(); const team = state.agents.find(a => a.id === 'meeting-team')!; const member = state.agents.find(a => a.id === 'minutes')!
    expect(teamIssues(state, team.draft, 'zhou')).toEqual([])
    run({ type: 'disable', ids: [member.id], policy: 'pause', note: '模拟停用依赖' }); expect(teamIssues(state, team.draft).join()).toContain('停用')
    expect(state.runs.find(r => r.id === 'demo-task-1001')?.status).toBe('暂停'); expect(member.versions.length).toBeGreaterThan(0)
  })
  it('merges allows but lets personal or department deny win, with explicit child inheritance', () => {
    const a = seedCampus().agents.find(a => a.id === 'minutes')!
    a.grants = [{ id: 'g1', subject: 'department', target: '教务处', children: false, effect: 'allow' }]
    expect(usageDecision(a, 'li').allowed).toBe(false); a.grants[0].children = true; expect(usageDecision(a, 'li').allowed).toBe(true)
    a.grants.push({ id: 'g2', subject: 'user', target: 'li', children: false, effect: 'deny' }); expect(usageDecision(a, 'li').allowed).toBe(false)
    a.grants[0].effect = 'deny'; a.grants[1].effect = 'allow'; expect(usageDecision(a, 'li').allowed).toBe(false)
  })
  it('copies configuration without grants/history/tests and requires credential revalidation', () => {
    const { state, run, test } = setup(); const id = run({ type: 'copy', id: 'minutes', name: '纪要专家副本' })!; const a = state.agents.find(a => a.id === id)!
    expect(a.versions).toEqual([]); expect(a.tests).toEqual([]); expect(a.grants).toEqual([]); expect(a.credentialChecked).toBe(false)
    test(id); expect(() => run({ type: 'publish', id, note: '发布副本' })).toThrow('凭证')
  })
  it('preserves published and referenced records while deleting only eligible drafts', () => {
    const { state, run } = setup(); expect(() => run({ type: 'delete', id: 'minutes' })).toThrow('保留')
    run({ type: 'delete', id: 'policy' }); expect(state.agents.some(a => a.id === 'policy' && !a.deletedAt)).toBe(false); expect(state.audits[0].action).toContain('删除')
  })
  it('retries simulated authorization synchronization without changing versions or tests', () => {
    const { state, run } = setup(); const a = state.agents.find(a => a.id === 'minutes')!; const before = clone(a.versions)
    run({ type: 'grants', id: a.id, grants: [], fail: true }); expect(a.sync).toBe('failed')
    run({ type: 'sync', id: a.id }); expect(a.sync).toBe('synced'); expect(a.versions).toEqual(before)
  })
  it('rolls back browser-storage failures, preserves legacy data and rejects stale writes', () => {
    const data = new Map<string, string>(); let fail = false
    const storage = { getItem: (k: string) => data.get(k) ?? null, removeItem: (k: string) => { data.delete(k) }, setItem: (k: string, v: string) => { if (fail) throw new Error('disk'); data.set(k, v) } }
    const store = new PrototypeStore(storage); const before = store.state(); fail = true
    expect(() => store.campusAction(before.campus!.revision, admin, { type: 'delete', id: 'policy' })).toThrow('disk')
    expect(store.state().campus).toEqual(before.campus); expect(store.state().agents).toEqual(before.agents)
    fail = false; store.campusAction(before.campus!.revision, admin, { type: 'delete', id: 'policy' })
    expect(() => store.campusAction(before.campus!.revision, admin, { type: 'delete', id: 'meeting-review' })).toThrow('已更新')
    expect(new PrototypeStore(storage).state().campus?.agents.some(a => a.id === 'policy' && !a.deletedAt)).toBe(false)
    expect(JSON.parse(data.get(STORAGE_KEY)!).entities.length).toBeGreaterThan(0)
  })
})
