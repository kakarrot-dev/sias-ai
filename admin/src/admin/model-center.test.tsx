// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { App } from './App'
import { ModelCenter } from './ModelCenter'
import { PrototypeStore, prototypeStore, resetPrototype, STORAGE_KEY } from './prototype-store'
import { blankConfig, clone, upgradeCampus, expertMvpIssues, liveVersion, selectCapabilities, type Actor } from './campus/model'
import { defaultInteractionConfig } from './campus/interaction-model'
import { agentModelName, demoRelayResponse, modelAvailable, modelReferences, modelKey, parseRelayModels, resolveAgentModel, type ModelCenterAction } from './model-center'

class MemoryStorage implements Storage {
  values = new Map<string, string>(); fail = false
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { if (this.fail) throw new Error('写入失败'); this.values.set(key, value) }
}
const admin: Actor = { role: 'admin', department: '信息化处' }
const store = () => prototypeStore()
const state = () => store().state().campus!
const center = () => state().modelCenter!
const action = (value: ModelCenterAction, actor = admin) => store().modelCenterAction(state().revision, actor, value)
const setup = () => { action({ type: 'service-save', name: '自建中转站', baseUrl: 'https://relay.example.invalid/v1/', credentialRef: 'RELAY_API_KEY' }); action({ type: 'sync-demo', response: demoRelayResponse }); return center().service.id }
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const fill = (name: string, value: string) => fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } })
beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage()); vi.stubGlobal('sessionStorage', new MemoryStorage()); resetPrototype()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute('open') } })
})
afterEach(() => { cleanup(); Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close'); vi.restoreAllMocks(); vi.unstubAllGlobals() })
it.each([null, {}, { data: null }, { data: [{ id: '' }] }, { data: [{ id: ' a ' }] }, { data: [{ id: 'a' }, { id: 'a' }] }])('rejects malformed model responses without inventing models: %j', payload => {
  expect(() => parseRelayModels(payload)).toThrow()
})
it('parses IDs without guessing model capabilities', () => {
  expect(parseRelayModels({ data: [{ id: 'unknown-vision', owned_by: 'relay' }] })).toEqual(['unknown-vision'])
  expect(parseRelayModels({ data: [] })).toEqual([])
})
it('renames saved demo entries without rewriting Agent history or dropping model references', () => {
  const saved = clone(state()); const model = saved.modelCenter!.models[0]
  model.modelId = 'campus-text'; model.displayName = '校内通用语言模型'
  // Simulate an old snapshot consistently, including the newly added catalog examples.
  for (const agent of saved.agents) for (const config of [agent.draft, ...agent.versions.map(v => v.config)]) {
    if (config.model === 'deepseek-v4') config.model = 'campus-text'
  }
  const history = clone(saved.agents); const before = modelReferences(saved, model).map(a => a.id)
  upgradeCampus(saved)
  expect(model).toMatchObject({ modelId: 'deepseek-v4', displayName: 'deepseek-v4' })
  expect(modelReferences(saved, clone(model)).map(a => a.id)).toEqual(before)
  expect(saved.agents).toEqual(history)
  expect(resolveAgentModel(saved, { model: 'campus-text' })?.modelId).toBe('deepseek-v4')
  expect(resolveAgentModel(saved, { model: 'campus-text', modelProviderId: 'another-relay' })).toBeUndefined()
  const once = clone(saved); upgradeCampus(saved); expect(saved).toEqual(once)
})
it('keeps administrator display names when upgrading old relay demo IDs', () => {
  const saved = clone(state()); const model = saved.modelCenter!.models[0]
  model.modelId = 'relay-chat-demo'; model.displayName = '我的专用模型'
  upgradeCampus(saved)
  expect(model).toMatchObject({ modelId: 'deepseek-v4', displayName: '我的专用模型' })
  expect(resolveAgentModel(saved, { model: 'relay-chat-demo' })).toBe(model)
})
it('syncs disabled models, preserves administrator metadata and marks missing upstream models offline', () => {
  const providerId = setup(); const modelId = 'deepseek-v4'
  expect(center().models.filter(m => m.providerId === providerId)).toHaveLength(3)
  expect(center().models.filter(m => m.providerId === providerId).every(m => !m.enabled && m.inputTypes.join() === 'text' && !m.supportsTools)).toBe(true)
  action({ type: 'model-edit', providerId, modelId, displayName: '通用模型', inputTypes: ['text', 'image'], supportsTools: true })
  action({ type: 'model-status', providerId, modelId, enabled: true })
  action({ type: 'sync-demo', response: { data: [{ id: modelId }] } })
  expect(center().models.find(m => m.providerId === providerId && m.modelId === modelId)).toMatchObject({ displayName: '通用模型', enabled: true, supportsTools: true, inputTypes: ['text', 'image'], upstreamAvailable: true })
  expect(center().models.find(m => m.providerId === providerId && m.modelId === 'glm-5.2')?.upstreamAvailable).toBe(false)
  expect(() => action({ type: 'model-status', providerId, modelId: 'glm-5.2', enabled: true })).toThrow('已下线')
  action({ type: 'model-status', providerId, modelId, enabled: false }); action({ type: 'sync-demo', response: demoRelayResponse })
  expect(center().models.find(m => m.providerId === providerId && m.modelId === modelId)?.enabled).toBe(false)
  expect(new PrototypeStore(localStorage).state().campus!.modelCenter).toEqual(center())
})
it('leaves the last catalog unchanged after invalid sync, stale revisions or persistence failure', () => {
  setup(); const before = store().state(); const revision = state().revision
  expect(() => action({ type: 'sync-demo', response: { error: 'upstream unavailable' } })).toThrow('data')
  expect(store().state()).toEqual(before)
  expect(() => store().modelCenterAction(revision - 1, admin, { type: 'service-status', enabled: false })).toThrow('已更新')
  expect(store().state()).toEqual(before)
  ;(localStorage as MemoryStorage).fail = true
  expect(() => action({ type: 'service-status', enabled: false })).toThrow('写入失败')
  expect(store().state()).toEqual(before)
})
it.each(['auditor', 'configurer', 'publisher'])('rejects model management by %s', role => {
  const before = store().state()
  expect(() => action({ type: 'service-status', enabled: false }, { ...admin, role } as Actor)).toThrow('仅系统管理员')
  expect(store().state()).toEqual(before)
})
it.each(['https://user:secret@relay.example/v1', 'https://relay.example/v1?key=secret', 'file:///tmp/models'])('rejects unsafe service address %s', baseUrl => {
  const before = store().state()
  expect(() => action({ type: 'service-save', name: '中转站', baseUrl, credentialRef: 'RELAY_KEY' })).toThrow('Base URL')
  expect(store().state()).toEqual(before)
})
it('stores only a credential reference and preserves old snapshots when the endpoint changes', () => {
  const providerId = setup(); const modelId = 'deepseek-v4'
  action({ type: 'model-status', providerId, modelId, enabled: true })
  const id = store().campusAction(state().revision, admin, { type: 'create', kind: 'expert', publish: true, config: { ...blankConfig(), model: modelId, modelProviderId: providerId, name: '中转模型专家', description: '回答咨询', prompt: '回答问题' } })!
  const before = clone(state().agents.find(a => a.id === id)!.versions)
  expect(before[0].config).toMatchObject({ model: modelId, modelProviderId: providerId, modelDisplayName: modelId, modelProviderName: '自建中转站' })
  action({ type: 'service-save', name: '另一中转站', baseUrl: 'https://other.example.invalid/v1', credentialRef: 'OTHER_RELAY_KEY' })
  expect(center().service.id).not.toBe(providerId)
  expect(state().agents.find(a => a.id === id)!.versions).toEqual(before)
  expect(modelAvailable(center(), resolveAgentModel(state(), before[0].config))).toBe(false)
  expect(agentModelName(state(), before[0].config, true)).toBe(modelId)
  expect(localStorage.getItem(STORAGE_KEY)).toContain('OTHER_RELAY_KEY')
  const unchanged = store().state()
  expect(() => action({ type: 'service-save', name: '中转站', baseUrl: 'https://relay.example.invalid/v1', credentialRef: 'sk-not-a-real-key' })).toThrow('不要输入真实密钥')
  expect(store().state()).toEqual(unchanged)
})
it('uses managed availability and declared model capabilities for Agent publication', () => {
  const providerId = setup(); const modelId = 'deepseek-v4'; const config = { ...blankConfig(), model: modelId, modelProviderId: providerId, name: '配置检查专家', description: '处理内容', prompt: '按要求处理', interaction: defaultInteractionConfig() }
  config.interaction.input.modalities = ['text', 'image']; Object.assign(config, selectCapabilities(config, ['calendar']))
  expect(expertMvpIssues(state(), '', config, true).join()).toMatch(/已启用/)
  action({ type: 'model-status', providerId, modelId, enabled: true })
  expect(expertMvpIssues(state(), '', config, true).join()).toMatch(/多模态/)
  expect(expertMvpIssues(state(), '', config, true).join()).toMatch(/工具调用/)
  action({ type: 'model-edit', providerId, modelId, displayName: '多模态工具模型', inputTypes: ['text', 'image'], supportsTools: true })
  expect(expertMvpIssues(state(), '', config, true)).toEqual([])
  action({ type: 'service-status', enabled: false })
  expect(expertMvpIssues(state(), '', config, true).join()).toMatch(/可用的模型/)
})
it('configures the relay, syncs and enables a model, then selects it directly during Agent creation', async () => {
  window.history.replaceState(null, '', '#/settings/models'); render(<App />)
  await screen.findByRole('heading', { name: '模型列表' })
  click('配置中转站'); fill('中转站名称', '我的中转站'); fill('Base URL', 'https://relay.example.invalid/v1'); fill('服务端凭证引用', 'RELAY_API_KEY'); click('保存中转站')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  click('同步模型（演示）'); await screen.findByRole('button', { name: '配置模型 deepseek-v4' })
  click('配置模型 deepseek-v4'); fill('模型展示名称', '日常问答模型'); fireEvent.click(screen.getByRole('checkbox', { name: '工具调用（Tool Calling）' })); click('保存模型')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  click('启用模型 deepseek-v4'); click('确认启用'); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  click('创建专家'); await screen.findByRole('heading', { name: '创建专家智能体' })
  const selector = screen.getByRole('combobox', { name: '运行模型' })
  expect(selector).toHaveValue(''); expect(within(selector).getByRole('option', { name: '日常问答模型 · deepseek-v4' })).toBeInTheDocument()
  expect(within(selector).queryByRole('option', { name: /campus-text|glm-5.2/ })).not.toBeInTheDocument()
  fireEvent.change(selector, { target: { value: modelKey({ providerId: center().service.id, modelId: 'deepseek-v4' }) } })
  fill('专家名称', '中转站问答专家'); fill('专家简介', '通过所选模型回答'); fill('系统提示词', '回答用户的问题。'); click('保存草稿')
  await waitFor(() => expect(screen.getByRole('button', { name: '发布专家' })).toBeEnabled())
  click('发布专家'); fill('发布说明', '绑定目录模型'); click('确认发布')
  await waitFor(() => expect(state().agents.find(a => a.draft.name === '中转站问答专家')?.live).toBe(1))
  const agent = state().agents.find(a => a.draft.name === '中转站问答专家')!
  expect(liveVersion(agent)?.config).toMatchObject({ model: 'deepseek-v4', modelProviderId: center().service.id, modelDisplayName: '日常问答模型' })
  click('系统设置'); await screen.findByRole('heading', { name: '系统设置' }); click('模型管理'); await screen.findByRole('heading', { name: '模型列表' })
  click('停用模型 deepseek-v4'); click('确认停用'); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  click('智能体中心'); await screen.findByRole('heading', { name: '智能体中心' }); click('中转站问答专家')
  await waitFor(() => expect(screen.getByRole('option', { name: /日常问答模型（当前不可用/ })).toBeDisabled())
  expect(state().agents.find(a => a.id === agent.id)!.versions).toEqual(agent.versions)
})
it('shows invalid connection settings inside the dialog and does not mutate saved state', async () => {
  render(<ModelCenter state={state()} reload={vi.fn()} notify={vi.fn()} navigate={vi.fn()} />)
  const before = store().state(); click('配置中转站'); fill('Base URL', 'wrong'); fill('服务端凭证引用', 'RELAY_KEY'); click('保存中转站')
  expect(await within(screen.getByRole('dialog', { name: '配置中转站' })).findByRole('alert')).toHaveTextContent('有效的中转站')
  expect(store().state()).toEqual(before)
})
it('retries the read after a persisted model change without repeating the action', async () => {
  const reload = vi.fn().mockRejectedValueOnce(new Error('read failed')).mockResolvedValue(undefined)
  render(<ModelCenter state={state()} reload={reload} notify={vi.fn()} navigate={vi.fn()} />)
  click('停用模型 deepseek-v4'); click('确认停用')
  await screen.findByRole('button', { name: '重新读取' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); const revision = state().revision
  click('重新读取'); await waitFor(() => expect(reload).toHaveBeenCalledTimes(2))
  expect(state().revision).toBe(revision)
})
