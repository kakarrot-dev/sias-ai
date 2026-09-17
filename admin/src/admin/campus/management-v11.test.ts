import { beforeEach, describe, expect, it, vi } from 'vitest'

// Retain coverage for the dormant multi-agent workflows. Current default scope is
// verified without this override in single-agent-scope.test.tsx.
vi.mock('./availability', async original => ({ ...await original<typeof import('./availability')>(), multiAgentEnabled: true, expertMvpEnabled: false, agentAvailable: () => true }))
import { applyCampusAction, type CampusAction } from './actions'
import { blankConfig, clone, configDigest, isCaptain, liveVersion, platformBinding, releaseIssues, seedCampus, teamIssues, usageDecision, type Actor, type CampusState } from './model'

const admin: Actor = { role: 'admin', department: '信息化处' }
const publisher: Actor = { role: 'publisher', department: '信息化处' }
let state: CampusState
const get = (id: string) => state.agents.find(a => a.id === id)!
const act = (action: CampusAction, actor = admin) => applyCampusAction(state, actor, action)
const sample = (id: string) => act({ type: 'test', id, round: 1, pass: true, reviewer: '林晓（模拟复核）' })
const revise = (id: string) => act({ type: 'save', id, config: { ...clone(get(id).draft), description: '修订后的简介' }, credentialChecked: true })
const newLeader = () => act({ type: 'create', kind: 'expert', dutyType: 'captain', config: { ...blankConfig(), name: '专属队长', description: '负责团队协作', prompt: '你是高校专家团队长。', tools: [platformBinding('captain')] } })!
const newTeam = (leader: string) => act({ type: 'create', kind: 'team', config: { ...blankConfig(), name: '验收专家团', team: { captain: { id: leader, version: 0, draftDigest: configDigest(get(leader).draft) }, members: [{ id: 'schedule', version: 1 }, { id: 'minutes', version: 1 }], dispatch: '' } } })!
beforeEach(() => { state = seedCampus() })

describe('PM 确认的智能体管理契约', () => {
  it('publishes valid configuration without test reports and keeps usage authorization independent', () => {
    const id = act({ type: 'create', kind: 'expert', config: { ...blankConfig(), name: '待开放专家' } })!
    expect(get(id).grants).toEqual([])
    expect(get(id).tests).toEqual([])
    act({ type: 'publish', id, note: '配置完整，无需后台调试', }, publisher)
    expect(get(id).live).toBe(1); expect(usageDecision(get(id), 'lin').allowed).toBe(false)
    revise(id); expect(releaseIssues(state, get(id))).toEqual([])
    expect(get(id).tests).toEqual([])
  })
  it('allows a publisher to release directly and rejects configurer publication', () => {
    revise('minutes'); sample('minutes')
    expect(() => act({ type: 'publish', id: 'minutes', note: '配置员无发布权' }, { role: 'configurer', department: '信息化处' })).toThrow('发布权限')
    act({ type: 'publish', id: 'minutes', note: '发布人员复核' }, publisher)
    expect(get('minutes').live).toBe(2)
  })
  it('ignores retired test-set configuration and preserves reports when changing the owner', () => {
    const a = get('minutes'); const reports = clone(a.tests)
    act({ type: 'owners', ids: [a.id], owner: 'chen' })
    expect(a.testHistory).toEqual(expect.arrayContaining(reports))
    const config = clone(a.draft); Reflect.deleteProperty(config, 'testSet')
    act({ type: 'save', id: a.id, config, credentialChecked: true })
    expect(releaseIssues(state, a)).toEqual([])
    act({ type: 'publish', id: a.id, note: '旧测试集不参与发布检查' })
    expect(a.live).toBe(2)
  })
  it('keeps snapshots and reports intact across simulated publication failure and retry', () => {
    revise('minutes'); sample('minutes'); const versions = clone(get('minutes').versions)
    act({ type: 'publish', id: 'minutes', note: '测试失败分支', fail: true })
    expect(get('minutes').versions).toEqual(versions); expect(get('minutes').pending?.failed).toBe(true)
    act({ type: 'publish', id: 'minutes', note: '重试发布' })
    expect(get('minutes').versions).toHaveLength(2); expect(get('minutes').pending).toBeUndefined()
    expect(() => act({ type: 'publish', id: 'minutes', note: '重复' })).toThrow('无需重复')
  })
  it('publishes a captain with its team and never independently', () => {
    const leader = newLeader(); const team = newTeam(leader)
    expect(isCaptain(get(leader))).toBe(true)
    expect(() => sample(leader)).toThrow('所属专家团')
    expect(() => act({ type: 'publish', id: leader, note: '单独发布' })).toThrow('随所属专家团')
    expect(get(team).tests).toEqual([]); act({ type: 'publish', id: team, note: '团队引用检查通过' })
    expect(get(team).live).toBe(1); expect(get(leader).live).toBe(1)
    expect(liveVersion(get(team))!.config.team.captain).toEqual({ id: leader, version: 1 })
    expect(usageDecision(get(leader), 'lin').allowed).toBe(false)
  })
  it('rejects a changed captain draft until the team explicitly selects it', () => {
    const leader = newLeader(); const team = newTeam(leader); sample(team); revise(leader)
    expect(() => act({ type: 'publish', id: team, note: '使用旧测试' })).toThrow('队长草稿已变化')
    const c = clone(get(team).draft); c.team.captain.draftDigest = configDigest(get(leader).draft)
    act({ type: 'save', id: team, config: c, credentialChecked: true })
    expect(get(team).tests).toEqual([]); sample(team); act({ type: 'publish', id: team, note: '重新测试' })
    expect(liveVersion(get(leader))!.config.description).toBe('修订后的简介')
  })
  it('enforces captain ownership and at least two different ordinary members', () => {
    const leader = newLeader(); const team = newTeam(leader)
    expect(() => act({ type: 'create', kind: 'team', config: { ...clone(get(team).draft), name: '第二团队' } })).toThrow('归属其他')
    const c = clone(get(team).draft); c.team.members = [c.team.members[0]]
    expect(teamIssues(state, c, undefined, team).join('；')).toContain('至少选择两名')
    c.team.members = [{ id: leader, version: 0 }, { id: leader, version: 0 }]
    expect(teamIssues(state, c, undefined, team).join('；')).toContain('不能重复')
  })
  it('lets internal members participate under a team grant and retains business dependency checks', () => {
    get('minutes').grants = []; get('minutes').usageMode = 'internal'
    expect(usageDecision(get('minutes'), 'lin').allowed).toBe(false)
    expect(teamIssues(state, get('meeting-team').draft, 'lin', 'meeting-team')).toEqual([])
    get('minutes').disabled = true
    expect(teamIssues(state, get('meeting-team').draft, 'lin', 'meeting-team').join('；')).toContain('停用')
  })
  it('keeps member references fixed after a new expert version is published', () => {
    const before = clone(liveVersion(get('meeting-team')))
    revise('minutes'); sample('minutes'); act({ type: 'publish', id: 'minutes', note: '独立升级' })
    expect(get('meeting-team').draft.team.members.find(p => p.id === 'minutes')!.version).toBe(1)
    expect(liveVersion(get('meeting-team'))).toEqual(before)
  })
  it('retains permanent captain ownership after replacement of a published team leader', () => {
    const leader = newLeader(); const team = newTeam(leader); sample(team); act({ type: 'publish', id: team, note: '首次发布' })
    const c = clone(get(team).draft); c.team.captain = { id: '', version: 0 }
    act({ type: 'save', id: team, config: c, credentialChecked: true })
    expect(() => act({ type: 'create', kind: 'team', config: { ...clone(liveVersion(get(team))!.config), name: '另一专家团' } })).toThrow('归属其他')
  })
  it('changes direct usage immediately without changing published configuration or grants', () => {
    const a = get('minutes'); const version = clone(a.versions)
    act({ type: 'usage-mode', id: a.id, mode: 'internal' }); expect(usageDecision(a, 'lin').allowed).toBe(false)
    act({ type: 'usage-mode', id: a.id, mode: 'public' }); expect(usageDecision(a, 'lin').allowed).toBe(true)
    expect(a.versions).toEqual(version)
    expect(() => act({ type: 'usage-mode', id: 'captain', mode: 'public' })).toThrow('普通专家')
  })
  it('keeps disable separate from publication and restores without auto-resuming old work', () => {
    act({ type: 'disable', ids: ['minutes'], policy: 'pause', note: '依赖维护' })
    const runs = clone(state.runs); revise('minutes'); sample('minutes')
    act({ type: 'publish', id: 'minutes', note: '停用期间准备版本' })
    expect(get('minutes').disabled).toBe(true)
    act({ type: 'restore', id: 'minutes', note: '依赖恢复' })
    expect(get('minutes').disabled).toBe(false); expect(state.runs).toEqual(runs)
  })
  it('does not resurrect revoked grants on restore or rollback', () => {
    revise('minutes'); sample('minutes'); act({ type: 'publish', id: 'minutes', note: '升级' })
    act({ type: 'grants', id: 'minutes', grants: [], fail: false })
    act({ type: 'disable', ids: ['minutes'], policy: 'pause', note: '维护' })
    act({ type: 'restore', id: 'minutes', note: '恢复' }); act({ type: 'rollback', id: 'minutes', version: 1, note: '回退' })
    expect(get('minutes').live).toBe(1); expect(usageDecision(get('minutes'), 'lin').allowed).toBe(false)
  })
  it('cleans an unused tested draft from visibility and retains configuration, tests and audit', () => {
    const id = act({ type: 'create', kind: 'expert', config: { ...blankConfig(), name: '清理验收专家' } })!
    sample(id); revise(id); const before = clone(get(id))
    act({ type: 'delete', id })
    expect(get(id).deletedAt).toBeTruthy(); expect(get(id).draft).toEqual(before.draft); expect(get(id).testHistory).toEqual(before.testHistory)
    expect(state.audits.some(a => a.agentId === id && a.action.includes('删除'))).toBe(true)
    expect(() => act({ type: 'delete', id: 'minutes' })).toThrow('未发布')
  })
  it('copies a team without stealing its captain or copying usage and evaluation records', () => {
    const id = act({ type: 'copy', id: 'meeting-team', name: '会议专家团副本' })!
    expect(get(id).draft.team.captain.id).toBe(''); expect(get(id).grants).toEqual([]); expect(get(id).tests).toEqual([])
    expect(get(id).versions).toEqual([]); expect(get(id).draft.team.members).toHaveLength(2)
  })
})
