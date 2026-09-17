import { describe, expect, it } from 'vitest'
import { PrototypeStore } from './prototype-store'
import { agentLifecycle, changedAgentSections, defaultExperience, parseExperience } from './agent-experience'
import { blankAgent, activeVersion, type AgentConfig, type Entity } from './shared'

const config = (): AgentConfig => ({ ...blankAgent(), name: '资料整理助手', role: '整理资料', description: '整理材料中的事实与待办事项。', systemPrompt: '只依据提供的材料整理事实，不编造信息。', output: '输出可核对的事实清单。', experience: defaultExperience() })
const create = (store: PrototypeStore) => store.create('agent', config()) as Entity<AgentConfig>
const publish = (store: PrototypeStore, entity: Entity<AgentConfig>) => { const checked = store.check(entity.id, entity.revision); return store.publish(entity.id, checked.revision, '首个可用版本') as Entity<AgentConfig> }

describe('Agent center prototype settings and publication boundaries', () => {
  it('persists settings across a fresh store, invalidates checks and keeps the release immutable', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
    const store = new PrototypeStore(storage, false)
    const entity = publish(store, create(store))
    const saved = store.save(entity.id, entity.revision, { ...entity.draft, experience: { ...entity.draft.experience!, opening: '请提供需要整理的资料。', knowledgeIds: ['kb-handbook'], visibility: 'specified', audience: '产品部', channelIds: ['web', 'feishu'] } }) as Entity<AgentConfig>
    const fresh = new PrototypeStore(storage).get(entity.id) as Entity<AgentConfig>
    expect(fresh.draft.experience).toEqual(saved.draft.experience)
    expect(fresh.validation).toBeUndefined()
    expect(activeVersion(fresh)?.config.experience?.knowledgeIds).toEqual([])
    expect(agentLifecycle(fresh).key).toBe('changes')
    expect(() => store.publish(fresh.id, fresh.revision, '未经检查')).toThrow('重新预检')
  })
  it('keeps old configurations unchanged until a new setting is edited', () => {
    const store = new PrototypeStore(undefined, false)
    const { experience: _, ...legacy } = config()
    const entity = store.create('agent', legacy) as Entity<AgentConfig>
    expect(entity.draft.experience).toBeUndefined()
    expect(publish(store, entity).versions[0].config.experience).toBeUndefined()
  })
  it('imports a fresh private draft and requires channel selection before publication', () => {
    const store = new PrototypeStore(undefined, false)
    const imported = store.importAgent({ kind: 'agent', config: { ...config(), experience: { ...defaultExperience(), visibility: 'workspace', channelIds: ['api', 'feishu'] } } }, '导入的资料助手')
    expect(imported.versions).toEqual([])
    expect(imported.draft.experience).toMatchObject({ visibility: 'private', audience: '', channelIds: [] })
    expect(store.check(imported.id, imported.revision).validation?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'experience.channelIds' })]))
  })
  it('rejects malformed imports and missing resources without partially creating an agent', () => {
    const store = new PrototypeStore(undefined, false)
    expect(() => store.importAgent({ kind: 'group', config: config() }, '错误导入')).toThrow('kind: agent')
    expect(() => store.importAgent({ kind: 'agent', config: { ...config(), capabilityVersionIds: ['unknown-capability'] } }, '缺失资源')).toThrow('不存在的能力')
    expect(() => store.importAgent({ kind: 'agent', config: config(), asset: {} }, '格式错误')).toThrow()
    expect(store.state().agents).toHaveLength(0)
    expect(store.state().audits).toHaveLength(0)
  })
  it('rolls back import data if browser storage fails', () => {
    const store = new PrototypeStore({ getItem: () => null, setItem: () => { throw new Error('quota') }, removeItem: () => {} }, false)
    expect(() => store.importAgent({ kind: 'agent', config: config() }, '存储失败')).toThrow('quota')
    expect(store.state().agents).toHaveLength(0)
  })
  it('copies behavior while removing source channel and audience settings', () => {
    const store = new PrototypeStore(undefined, false)
    const entity = store.create('agent', { ...config(), experience: { ...defaultExperience(), visibility: 'specified', audience: '产品部', channelIds: ['api'], opening: '欢迎提问' } }) as Entity<AgentConfig>
    const copy = store.duplicate(entity.id, entity.revision, '独立副本', 'draft') as Entity<AgentConfig>
    expect(copy.draft.experience).toMatchObject({ opening: '欢迎提问', visibility: 'private', audience: '', channelIds: [] })
    expect(store.get(entity.id)).toEqual(entity)
  })
  it('rejects invalid model parameters, lists and input modes', () => {
    expect(() => parseExperience({ ...defaultExperience(), temperature: NaN })).toThrow()
    expect(() => parseExperience({ ...defaultExperience(), maxTokens: 1.5 })).toThrow()
    expect(() => parseExperience({ ...defaultExperience(), modalities: [] })).toThrow('输入方式')
    expect(() => parseExperience({ ...defaultExperience(), knowledgeIds: ['invented'] })).toThrow()
    expect(() => parseExperience({ ...defaultExperience(), channelIds: null })).toThrow()
    expect(() => parseExperience({ ...defaultExperience(), visibility: 'everybody' })).toThrow()
  })
  it('checks a specified audience, duplicate fallback model and conflicting memory policy', () => {
    const store = new PrototypeStore(undefined, false)
    const entity = store.create('agent', { ...config(), contract: { inputFields: [], outputFields: [], missingInputPolicy: 'ask', historyRequirement: 'forbidden' }, experience: { ...defaultExperience(), visibility: 'specified', audience: '', fallbackModel: 'deepseek-v4-pro', longTermMemory: true } })
    const fields = store.check(entity.id, entity.revision).validation!.issues.map(i => i.field)
    expect(fields).toEqual(expect.arrayContaining(['experience.audience', 'modelId', 'memoryScopes']))
  })
  it('takes a release offline and online while preserving both its snapshot and newer draft', () => {
    const store = new PrototypeStore(undefined, false)
    const released = publish(store, create(store))
    const changed = store.save(released.id, released.revision, { ...released.draft, output: '新的交付要求' }) as Entity<AgentConfig>
    const offline = store.toggle(changed.id, changed.revision, true) as Entity<AgentConfig>
    expect(agentLifecycle(offline).key).toBe('offline')
    const online = store.toggle(offline.id, offline.revision, false) as Entity<AgentConfig>
    expect(agentLifecycle(online).key).toBe('changes')
    expect(online.versions).toEqual(released.versions)
    expect(online.draft.output).toBe('新的交付要求')
    const archived = store.archive(online.id, online.revision, true)
    expect(() => store.toggle(archived.id, archived.revision, false)).toThrow('取消归档')
  })
  it('compares the saved version against the actual changed sections', () => {
    const original = config()
    expect(changedAgentSections(original, original)).toEqual([])
    const changed = { ...original, experience: { ...original.experience!, knowledgeIds: ['kb-handbook'], opening: '新的开场白' } }
    expect(changedAgentSections(original, changed)).toEqual(['工作内容与指令', '知识库'])
  })
})
