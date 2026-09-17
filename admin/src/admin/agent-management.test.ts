import { describe, expect, it } from 'vitest'
import { PrototypeStore, STORAGE_KEY } from './prototype-store'
import { agentAsset, agentReferences, defaultContract, fieldsSchema, validateContractValue } from './agent-management'
import { defaultSetup, effectivePrompt } from './guided-config'
import { activeVersion, blankAgent, blankGroup, type AgentConfig, type Entity } from './shared'

const config = (): AgentConfig => ({ ...blankAgent(), name: '会议纪要助手', role: '整理会议与待办', description: '根据会议记录整理关键结论和任务，缺少信息时明确说明。', systemPrompt: '依据用户提供的会议材料整理结论，不伪造任何信息。', output: '交付关键结论、行动项与待补充的信息。', setup: { ...defaultSetup('custom'), inputDescription: '会议记录和本次议题' } })
const create = (store: PrototypeStore, changes: Partial<AgentConfig> = {}) => store.create('agent', { ...config(), ...changes }) as Entity<AgentConfig>
const publish = (store: PrototypeStore, entity: Entity<AgentConfig>) => { const checked = store.check(entity.id, entity.revision); return store.publish(entity.id, checked.revision, '验收版本') as Entity<AgentConfig> }
function storage() { const values = new Map<string, string>(); return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } } }

describe('Agent asset, version and lifecycle boundaries', () => {
  it('updates display metadata without changing draft behavior, checks or frozen releases', () => {
    const store = new PrototypeStore(undefined, false)
    const agent = publish(store, create(store))
    const old = structuredClone(agent)
    const updated = store.save(agent.id, agent.revision, agent.draft, { ...agentAsset(agent), name: '会议助手新版展示名', owner: '产品团队', displayDescription: '仅展示用途', tags: ['会议', '会议', '内部'] }) as Entity<AgentConfig>
    expect(updated.draft).toEqual(old.draft)
    expect(updated.versions).toEqual(old.versions)
    expect(updated.validation).toEqual(old.validation)
    expect(agentAsset(updated).tags).toEqual(['会议', '内部'])
    expect(store.state().audits[0].action).toBe('metadata_updated')
    expect(effectivePrompt(updated.draft)).not.toContain('新版展示名')
  })
  it('invalidates checks for behavior changes and preserves the release and asset name', () => {
    const store = new PrototypeStore(undefined, false); const agent = publish(store, create(store))
    const updated = store.save(agent.id, agent.revision, { ...agent.draft, name: '新的运行名称' }) as Entity<AgentConfig>
    expect(updated.validation).toBeUndefined()
    expect(activeVersion(updated)?.config.name).toBe('会议纪要助手')
    expect(agentAsset(updated).name).toBe('会议纪要助手')
  })
  it('rejects workspace moves, status form edits and stale revisions', () => {
    const store = new PrototypeStore(undefined, false); const agent = create(store)
    expect(() => store.save(agent.id, agent.revision, agent.draft, { ...agentAsset(agent), workspaceId: 'another-tenant' })).toThrow('工作空间')
    expect(() => store.save(agent.id, agent.revision, agent.draft, { ...agentAsset(agent), status: 'archived' })).toThrow('资产状态')
    store.archive(agent.id, agent.revision, true)
    expect(() => store.save(agent.id, agent.revision, agent.draft)).toThrow('重新加载')
    expect(() => store.publish(agent.id, store.get(agent.id).revision, '归档后发布')).toThrow('取消归档')
  })
  it('copies the selected source with a new ID and no releases, checks or incoming references', () => {
    const store = new PrototypeStore(undefined, false); const agent = publish(store, create(store))
    const changed = store.save(agent.id, agent.revision, { ...agent.draft, output: '草稿中的新交付内容。' })
    const fromPublished = store.duplicate(agent.id, changed.revision, '发布版副本', 'published') as Entity<AgentConfig>
    const fromDraft = store.duplicate(agent.id, changed.revision, '草稿副本', 'draft') as Entity<AgentConfig>
    expect(fromPublished.id).not.toBe(agent.id)
    expect(fromPublished.draft.output).toBe(agent.draft.output)
    expect(fromDraft.draft.output).toBe('草稿中的新交付内容。')
    expect(fromPublished.versions).toEqual([]); expect(fromPublished.validation).toBeUndefined()
    expect(agentAsset(fromPublished).name).toBe('发布版副本')
    expect(fromPublished.draft.name).toBe(agent.draft.name)
    expect(agentReferences(store.state(), fromPublished.id)).toEqual([])
  })
  it('archives without changing existing pinned groups, but blocks new publication using archived agents', () => {
    const store = new PrototypeStore(undefined, false); const agent = publish(store, create(store, { purpose: 'business' }))
    const group = store.create('group', { ...blankGroup(), name: '会议整理流程', description: '整理会议资料', completion: '会议结论完整', steps: [{ id: 'node1', agentId: agent.id, task: '整理', input: '会议记录', output: '结论' }] })
    const checked = store.check(group.id, group.revision); const released = store.publish(group.id, checked.revision, '首次发布')
    const archived = store.archive(agent.id, agent.revision, true)
    expect(store.state().groups[0].blockingReasons).toEqual([])
    expect(store.state().groups[0].versions).toEqual(released.versions)
    const next = store.check(group.id, released.revision)
    expect(next.validation?.issues.some(i => i.message.includes('归档'))).toBe(true)
    expect(() => store.save(agent.id, archived.revision, agent.draft)).toThrow('取消归档')
    expect(agentReferences(store.state(), agent.id)[0].versions).toHaveLength(1)
  })
  it('deletes only unreferenced unpublished drafts, and restores the original ID and fields', () => {
    const db = storage(); const store = new PrototypeStore(db, false); const agent = create(store)
    const original = structuredClone(agent)
    store.delete(agent.id, agent.revision)
    expect(store.state().agents).toHaveLength(0)
    expect(store.state().deletedAgents).toHaveLength(1)
    const reloaded = new PrototypeStore(db, false)
    const restored = reloaded.restore(agent.id, reloaded.get(agent.id).revision)
    expect(restored.id).toBe(original.id); expect(restored.draft).toEqual(original.draft)
    expect(reloaded.state().deletedAgents).toHaveLength(0)
    const published = publish(reloaded, restored as Entity<AgentConfig>)
    expect(() => reloaded.delete(published.id, published.revision)).toThrow('发布历史')
    const draft = create(reloaded)
    reloaded.create('group', { ...blankGroup(), steps: [{ id: 'node', agentId: draft.id, task: '', input: '', output: '' }] })
    expect(() => reloaded.delete(draft.id, draft.revision)).toThrow('引用')
  })
  it('reads legacy data and keeps old published snapshots unchanged after saving metadata', () => {
    const db = storage(); const store = new PrototypeStore(db, false); const agent = publish(store, create(store))
    const raw = JSON.parse(db.getItem(STORAGE_KEY)!); delete raw.entities[0].asset
    db.setItem(STORAGE_KEY, JSON.stringify(raw))
    const reloaded = new PrototypeStore(db, false); const legacy = reloaded.get(agent.id) as Entity<AgentConfig>
    const changed = reloaded.save(legacy.id, legacy.revision, legacy.draft, { ...agentAsset(legacy), name: '迁移后的展示名' })
    expect(changed.versions).toEqual(agent.versions)
    expect(changed.draft).toEqual(agent.draft)
  })
  it('performs copy and delete atomically when browser persistence fails', () => {
    const db = storage(); const store = new PrototypeStore(db, false); const agent = create(store)
    const persisted = db.getItem(STORAGE_KEY); db.setItem = () => { throw new Error('quota') }
    expect(() => store.duplicate(agent.id, agent.revision, '新副本', 'draft')).toThrow('quota')
    expect(store.state().agents).toHaveLength(1)
    expect(db.getItem(STORAGE_KEY)).toBe(persisted)
    expect(() => store.delete(agent.id, agent.revision)).toThrow('quota')
    expect(store.state().agents).toHaveLength(1)
    expect(store.state().deletedAgents).toHaveLength(0)
  })
})

describe('structured input and output definitions', () => {
  it('persists typed fields, generates their schemas and freezes policies with the release', () => {
    const db = storage(); const store = new PrototypeStore(db, false)
    const contract = { ...defaultContract(), missingInputPolicy: 'reject' as const, inputFields: [{ key: 'topic', label: '会议主题', type: 'string' as const, required: true }], outputFields: [{ key: 'summary', label: '会议结论', type: 'string' as const, required: true }] }
    const draft = create(store, { contract, setup: { ...config().setup!, outputFormat: 'json' } })
    const released = publish(store, draft)
    expect(activeVersion(released)?.config.contract).toEqual(contract)
    expect(released.draft.systemPrompt).toContain('缺少必要信息时停止')
    expect(released.draft.systemPrompt).toContain('"summary"')
    expect(fieldsSchema(contract.inputFields).required).toEqual(['topic'])
    expect(new PrototypeStore(db, false).get(draft.id).draft).toEqual(released.draft)
  })
  it.each(['workspace_id', 'userId', 'api_key', 'session_id'])('rejects server-owned input field %s before publication', key => {
    const store = new PrototypeStore(undefined, false)
    const agent = create(store, { contract: { ...defaultContract(), inputFields: [{ key, label: '不能来自模型', type: 'string', required: true }] } })
    const checked = store.check(agent.id, agent.revision)
    expect(checked.validation?.issues.some(i => i.message.includes('身份或会话'))).toBe(true)
    expect(() => store.publish(agent.id, checked.revision, '禁止发布')).toThrow('发布条件')
  })
  it('preserves invalid definitions in drafts but rejects duplicate fields and non-JSON output on check', () => {
    const store = new PrototypeStore(undefined, false)
    const field = { key: 'result', label: '结果', type: 'string' as const, required: true }
    const agent = create(store, { contract: { ...defaultContract(), inputFields: [field, field], outputFields: [field] } })
    const checked = store.check(agent.id, agent.revision)
    expect(checked.validation?.issues.map(i => i.message).join(' ')).toContain('重复')
    expect(checked.validation?.issues.map(i => i.message).join(' ')).toContain('JSON')
    expect(checked.draft).toEqual(agent.draft)
  })
})

 it('validates sample values against required fields, types and undeclared inputs', () => {
   const fields = [{ key: 'count', label: '数量', type: 'number' as const, required: true }, { key: 'note', label: '说明', type: 'string' as const, required: false }]
   expect(validateContractValue(fields, { count: 0 })).toEqual([])
   expect(validateContractValue(fields, {})).toEqual(['缺少必填字段：count（数量）'])
   expect(validateContractValue(fields, { count: '0', tenant_id: 'forged' }).join(' ')).toContain('未声明')
   expect(validateContractValue(fields, { count: null }).join(' ')).toContain('类型')
   expect(validateContractValue(fields, { count: 1, note: null }).join(' ')).toContain('类型')
 })
