import { expect, it, vi } from 'vitest'

// Retain coverage for the dormant multi-agent workflows. Current default scope is
// verified without this override in single-agent-scope.test.tsx.
vi.mock('./availability', async original => ({ ...await original<typeof import('./availability')>(), multiAgentEnabled: true, expertMvpEnabled: false, agentAvailable: () => true }))
import { applyCampusAction } from './actions'
import { defaultDefinition } from './agent-definition'
import { releaseChanges } from './config-summary'
import { defaultInteractionConfig, newInputField } from './interaction-model'
import { blankConfig, clone, configDigest, liveVersion, managedConfig, platformBinding, seedCampus, validateConfig, validateDraft } from './model'

const admin = { role: 'admin' as const, department: '信息化处' }
function legacyFixture() {
  const state = seedCampus()
  const team = state.agents.find(a => a.id === 'meeting-team')!
  const captain = state.agents.find(a => a.id === 'captain')!
  const old = captain.versions.find(v => v.number === team.draft.team.captain.version)!.config
  old.interaction = defaultInteractionConfig()
  old.interaction.input.formTitle = '原队长表单'
  old.definition = defaultDefinition(old)
  old.definition.task.completion = 'receipt'
  captain.draft.interaction = defaultInteractionConfig()
  captain.draft.interaction.input.formTitle = '队长尚未发布的新表单'
  return { state, team, captain }
}

it('creates an assembly without generating team-owned input, output or completion settings', () => {
  const config = blankConfig(); config.name = '组队验收'
  const saved = managedConfig(config, 'team')
  expect(saved.interaction).toBeUndefined()
  expect(saved.definition).toBeUndefined()
  expect(saved.team.contractVersion).toBeUndefined()
  expect(saved.model).toBe(''); expect(saved.tools).toEqual([])
})

it('does not adopt a captain contract when saving a team or changing its metadata', () => {
  const { state, team } = legacyFixture()
  const snapshots = clone(team.versions)
  const members = clone(state.agents.filter(a => a.kind === 'expert'))
  const next = clone(team.draft); next.description = '组队资料更新'
  applyCampusAction(state, admin, { type: 'save', id: team.id, config: next, credentialChecked: true })
  expect(team.draft.interaction).toBeUndefined(); expect(team.draft.definition).toBeUndefined()
  expect(team.versions).toEqual(snapshots)
  expect(state.agents.filter(a => a.kind === 'expert')).toEqual(members)
})

it('retains obsolete team fields for compatibility but excludes them from draft and release validation', () => {
  const { state, team } = legacyFixture()
  const config = clone(team.draft)
  config.interaction = defaultInteractionConfig()
  config.interaction.input.entryMode = 'form'; config.interaction.input.attachments.fileMB = 0
  config.definition = defaultDefinition(config)
  config.definition.task = { ...config.definition.task, completion: 'receipt', receiptSystem: '', evidence: '' }
  config.definition.governance.handoffOwner = 'removed-person'
  config.team.contractVersion = 1
  expect(validateDraft(state, team, config)).toEqual([])
  expect(validateConfig(state, team, config)).toEqual([])
  applyCampusAction(state, admin, { type: 'save', id: team.id, config, credentialChecked: true })
  expect(team.draft.interaction).toEqual(config.interaction)
  expect(team.draft.definition).toEqual(config.definition)
  team.draft.team.members = []
  expect(validateConfig(state, team)).toContain('至少选择两名不同的普通专家')
})

it('still validates business input and completion on ordinary experts', () => {
  const state = seedCampus(); const expert = state.agents.find(a => a.id === 'minutes')!
  const config = clone(expert.draft)
  config.interaction = defaultInteractionConfig(); config.interaction.input.entryMode = 'form'
  config.definition = defaultDefinition(config); config.definition.task.completion = 'receipt'
  const issues = validateConfig(state, expert, config).join('；')
  expect(issues).toMatch(/至少添加一个填写项/); expect(issues).toMatch(/需要回执/)
  config.interaction.input.attachments.fileMB = 0
  expect(validateDraft(state, expert, config).join('；')).toMatch(/附件限制/)
})

it('does not import captain input when copying teams or editing historical versions', () => {
  const { state, team } = legacyFixture(); const snapshot = clone(team.versions[0])
  const id = applyCampusAction(state, admin, { type: 'copy', id: team.id, name: '组队副本' })!
  const copy = state.agents.find(a => a.id === id)!
  expect(copy.draft.team.captain.id).toBe(''); expect(copy.draft.team.members).toEqual(team.draft.team.members)
  expect(copy.draft.interaction).toBeUndefined()
  applyCampusAction(state, admin, { type: 'from-version', id: team.id, version: 1 })
  expect(team.draft.interaction).toBeUndefined(); expect(team.versions[0]).toEqual(snapshot)
})

it('omits obsolete team input and output from release differences', () => {
  const { state, team } = legacyFixture()
  team.draft.interaction = defaultInteractionConfig()
  team.draft.interaction.input.formTitle = '旧版团队表单'
  team.draft.definition = defaultDefinition(team.draft)
  team.draft.definition.task.completion = 'accepted'
  expect(releaseChanges(team, state)).toEqual([])
  team.draft.description = '成员组队说明'
  expect(releaseChanges(team, state).map(change => change.label)).toEqual(['名称与简介'])
})

it('keeps captain coordination validation independent of obsolete business forms', () => {
  const { state, captain } = legacyFixture()
  captain.draft.definition = defaultDefinition(captain.draft)
  captain.draft.definition.task.completion = 'receipt'
  captain.draft.interaction!.input.entryMode = 'form'
  captain.draft.interaction!.input.attachments.fileMB = 0
  expect(validateConfig(state, captain).join('；')).not.toMatch(/回执|填写项|附件限制/)
})

it('publishes and rolls back fixed member references while preserving member-owned requirements', () => {
  const state = seedCampus()
  const leaderId = applyCampusAction(state, admin, { type: 'create', kind: 'expert', dutyType: 'captain', config: { ...blankConfig(), name: '组队验收队长', tools: [platformBinding('captain')] } })!
  const leader = state.agents.find(a => a.id === leaderId)!
  const expert = state.agents.find(a => a.id === 'minutes')!
  expert.versions[0].config.interaction = defaultInteractionConfig()
  expert.versions[0].config.interaction.input.fields = [{ ...newInputField(), key: 'topic', label: '会议主题' }]
  const originalMember = clone(expert.versions[0])
  const config = blankConfig(); config.name = '组队发布验收'
  config.team = { captain: { id: leaderId, version: 0, draftDigest: configDigest(leader.draft) }, members: [{ id: 'minutes', version: 1 }, { id: 'schedule', version: 1 }], dispatch: '' }
  const id = applyCampusAction(state, admin, { type: 'create', kind: 'team', config })!
  const team = state.agents.find(a => a.id === id)!
  applyCampusAction(state, admin, { type: 'publish', id, note: '发布组队关系' })
  expect(leader.live).toBe(1); expect(liveVersion(team)!.config.interaction).toBeUndefined()
  expect(releaseChanges(team, state).map(change => change.label)).not.toContain('用户输入')
  const snapshot = clone(liveVersion(team))
  const updatedMember = clone(originalMember); updatedMember.number = 2; updatedMember.config.interaction!.input.formTitle = '新版纪要资料'
  expert.versions.push(updatedMember); expert.live = 2; expert.draft = clone(updatedMember.config)
  expect(team.draft.team.members[0].version).toBe(1)
  const next = clone(team.draft); next.team.members[0].version = 2
  applyCampusAction(state, admin, { type: 'save', id, config: next, credentialChecked: true })
  expect(releaseChanges(team, state).map(change => change.label)).toEqual(['队长与成员版本'])
  applyCampusAction(state, admin, { type: 'publish', id, note: '选用成员 v2' })
  applyCampusAction(state, admin, { type: 'rollback', id, version: 1, note: '恢复原组队关系' })
  expect(liveVersion(team)).toEqual(snapshot)
  expect(expert.versions[0]).toEqual(originalMember)
  expect(expert.draft.interaction!.input.formTitle).toBe('新版纪要资料')
})
