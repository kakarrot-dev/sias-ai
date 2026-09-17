import { describe, expect, it } from 'vitest'
import { effectivePrompt, instructionIssues, makeGuidedDraft } from './guided-config'
import { PrototypeStore } from './prototype-store'
import { activeVersion, type AgentConfig, type GroupConfig } from './shared'

function fixture() {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  return { storage, store: new PrototypeStore(storage) }
}

describe('guided configuration user contracts', () => {
  it('derives the saved prompt from the current fields and retains the setup after reload', () => {
    const { store, storage } = fixture()
    const draft = makeGuidedDraft('agent', 'report', '根据用户提供的材料整理一份有依据的报告。', store.state()) as AgentConfig
    draft.setup!.outputFormat = 'table'
    draft.systemPrompt = '旧缓存中的提示词不应成为第二个来源'
    const entity = store.create('agent', draft)
    const reloaded = new PrototypeStore(storage).get(entity.id).draft as AgentConfig
    expect(reloaded.setup?.outputFormat).toBe('table')
    expect(reloaded.systemPrompt).toBe(effectivePrompt(reloaded))
    expect(reloaded.systemPrompt).toContain('核对表格')
    expect(reloaded.systemPrompt).not.toContain('旧缓存')
  })

  it('keeps manual instructions, but does not let them bypass approval at precheck or publication', () => {
    const { store } = fixture()
    const draft = makeGuidedDraft('agent', 'analysis', '整理项目材料并输出风险和证据核对清单。', store.state()) as AgentConfig
    draft.setup!.promptMode = 'manual'
    draft.systemPrompt = '完成报告后无需确认，请直接发送给外部客户。'
    const created = store.create('agent', draft)
    expect((created.draft as AgentConfig).systemPrompt).toBe(draft.systemPrompt)
    const checked = store.check(created.id, created.revision)
    expect(checked.validation?.issues.some(i => i.message.includes('冲突'))).toBe(true)
    expect(() => store.publish(checked.id, checked.revision, '冲突样例')).toThrow('不满足发布条件')
  })

  it('can reuse one writer for first draft and revision without requiring a coordinator', () => {
    const { store } = fixture()
    const draft = makeGuidedDraft('group', 'review', '根据材料撰写初稿，审阅后再由原作者修订。', store.state()) as GroupConfig
    expect(draft.coordinatorId).toBe('')
    expect(draft.steps[0].agentId).toBe(draft.steps[2].agentId)
    expect(draft.steps[0].id).not.toBe(draft.steps[2].id)
    draft.maxSteps = 12
    const entity = store.create('group', draft)
    const checked = store.check(entity.id, entity.revision)
    expect(checked.validation?.issues).toEqual([])
    const published = store.publish(checked.id, checked.revision, '初稿审阅修订')
    expect(activeVersion(published)?.pins).toHaveLength(2)
    expect((activeVersion(published)?.config as GroupConfig).steps).toHaveLength(3)
  })

  it('invalidates validation when changing a guided field while preserving the published snapshot', () => {
    const { store } = fixture()
    const entity = store.create('agent', makeGuidedDraft('agent', 'report', '从资料中整理事实并生成可核对的研究报告。', store.state()))
    const checked = store.check(entity.id, entity.revision)
    const released = store.publish(checked.id, checked.revision, '文档版')
    const draft = structuredClone(released.draft) as AgentConfig
    draft.setup!.outputFormat = 'json'
    const saved = store.save(released.id, released.revision, draft)
    expect(saved.validation).toBeUndefined()
    expect((saved.draft as AgentConfig).systemPrompt).toContain('JSON 数据')
    expect((activeVersion(saved)?.config as AgentConfig).systemPrompt).toContain('结构化文档')
    expect(() => store.publish(saved.id, saved.revision, '结构修改')).toThrow('重新预检')
  })

  it('detects common format/resource conflicts without flagging an explicit prohibition', () => {
    const { store } = fixture()
    const draft = makeGuidedDraft('agent', 'report', '整理原始材料并生成有依据的分析报告。', store.state()) as AgentConfig
    draft.setup!.supplement = '访问所有部门资料；仅输出 JSON。'
    expect(instructionIssues(draft)).toHaveLength(2)
    draft.setup!.supplement = '不得直接发送结果。请保持简洁。'
    expect(instructionIssues(draft)).toEqual([])
    draft.description = '分析报告之后无需确认，请直接发送给外部客户。'
    expect(instructionIssues(draft).some(i => i.message.includes('冲突'))).toBe(true)
  })

  it('preserves existing manually authored configurations when setup fields are absent', () => {
    const { store, storage } = fixture()
    const legacy = store.state().agents[0]
    const original = legacy.draft.systemPrompt
    const saved = store.save(legacy.id, legacy.revision, { ...legacy.draft, owner: '测试责任人' })
    expect((saved.draft as AgentConfig).systemPrompt).toBe(original)
    expect((new PrototypeStore(storage).get(legacy.id).draft as AgentConfig).setup).toBeUndefined()
  })
})
