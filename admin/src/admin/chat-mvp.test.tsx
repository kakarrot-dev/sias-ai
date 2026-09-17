import { LEGACY_MODEL_PROVIDER, modelKey } from './model-center'
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { App } from './App'
import { CampusCenter } from './campus/CampusCenter'
import { PrototypeStore, prototypeStore, resetPrototype } from './prototype-store'
import { actionKey, binding, blankConfig, clone, liveVersion, models, selectCapabilities, skillActions, usageDecision, type Actor, type Config } from './campus/model'
import { defaultInteractionConfig, newInputField } from './campus/interaction-model'
import type { CampusAction } from './campus/actions'

const admin = { role: 'admin', department: '信息化处' } as const
class MemoryStorage implements Storage {
  values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}
beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage()); vi.stubGlobal('sessionStorage', new MemoryStorage()); resetPrototype()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute('open') } })
})
afterEach(() => { cleanup(); Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close'); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const store = () => prototypeStore()
const run = (action: CampusAction, actor: Actor = admin) => store().campusAction(store().state().campus!.revision, actor, action)
const getAgent = (id: string) => store().state().campus!.agents.find(a => a.id === id)!
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const fill = (name: string, value: string) => fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } })
const chooseModel = (modelId = 'deepseek-v4') => fireEvent.change(screen.getByRole('combobox', { name: '运行模型' }), { target: { value: modelKey({ providerId: LEGACY_MODEL_PROVIDER, modelId }) } })
async function open(path = '/agents') { window.history.replaceState(null, '', `#${path}`); render(<App />); await screen.findByRole('navigation', { name: '主导航' }); await waitFor(() => expect(screen.queryByText('正在载入交互原型…')).not.toBeInTheDocument()) }

it('combines capability type, purpose and keyword filters and shows the same purposes in details', async () => {
  await open('/capabilities')
  const changeFilter = (label: string, value: string) => fireEvent.change(screen.getByRole('combobox', { name: label }), { target: { value } })
  const initialRows = screen.getAllByRole('row').length
  changeFilter('目录能力类型', 'skill'); changeFilter('能力用途筛选', '文档处理'); fill('搜索能力目录', '飞书')
  expect(screen.getAllByRole('row')).toHaveLength(2)
  click('飞书文档读取')
  const dialog = within(screen.getByRole('dialog', { name: '飞书文档读取' }))
  expect(dialog.getByText('信息检索、文档处理')).toBeVisible()
  click('关闭')
  expect(screen.getByRole('combobox', { name: '能力用途筛选' })).toHaveValue('文档处理')
  changeFilter('目录能力类型', 'mcp')
  expect(screen.getByRole('heading', { name: '没有匹配的能力' })).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('0 项能力')
  fill('搜索能力目录', '创建')
  expect(screen.getAllByRole('row')).toHaveLength(2)
  expect(screen.getByRole('button', { name: '校内文档 MCP 服务' })).toBeVisible()
  changeFilter('能力用途筛选', '会议日程')
  expect(screen.getByRole('heading', { name: '没有匹配的能力' })).toBeVisible()
  click('清除筛选')
  expect(screen.getByRole('combobox', { name: '目录能力类型' })).toHaveValue('all')
  expect(screen.getByRole('combobox', { name: '能力用途筛选' })).toHaveValue('all')
  expect(screen.getByRole('textbox', { name: '搜索能力目录' })).toHaveValue('')
  expect(screen.getAllByRole('row')).toHaveLength(initialRows)
})

it('keeps the resource catalog while omitting assistants and department controls', async () => {
  await open()
  expect(within(screen.getByRole('navigation', { name: '主导航' })).getAllByRole('button').map(b => b.textContent)).toEqual(['总览', '智能体中心', '能力中心', '运行中心', '用户中心', '系统设置'])
  expect(screen.queryByRole('button', { name: /数字助理|专家团/ })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('演示身份')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('筛选部门')).not.toBeInTheDocument()
})
it.each(['/legacy-agents/new', '/legacy-agents/anything/edit'])('closes deferred route %s', async path => {
  const before = store().state()
  await open(path)
  expect(screen.getByRole('heading', { name: '页面不存在' })).toBeVisible()
  expect(store().state()).toEqual(before)
})
it.each(['configurer', 'publisher', 'auditor', 'consumer'])('rejects %s writes in the action layer', role => {
  const before = store().state()
  const config = { ...blankConfig(), name: '越权专家', description: '测试', prompt: '回答问题' }
  for (const action of [{ type: 'create', kind: 'expert', config }, { type: 'save', id: 'schedule', config, credentialChecked: true }, { type: 'publish', id: 'schedule', note: '不应发布' }] satisfies CampusAction[]) expect(() => run(action, { ...admin, role } as Actor)).toThrow('仅系统管理员')
  expect(store().state()).toEqual(before)
})
it('publishes configured capabilities without department requirements and preserves the old version', () => {
  const runs = clone(store().state().campus!.runs)
  const prior = clone(getAgent('schedule'))
  const config = clone(prior.draft); config.description = '会议安排咨询'; config.owner = 'old-owner'; config.department = '旧组织'
  config.tools = [binding('calendar')]; config.temperature = .6; config.maxTokens = 8192; config.streaming = false; config.interaction = defaultInteractionConfig(); config.interaction.output.format = 'markdown'
  run({ type: 'save', id: prior.id, config, credentialChecked: false })
  run({ type: 'publish', id: prior.id, note: '改为聊天咨询' })
  const saved = getAgent(prior.id)
  expect(liveVersion(saved)?.config).toMatchObject({ mode: 'agent', tools: config.tools, temperature: .6, maxTokens: 8192, streaming: false, interaction: { input: { modalities: ['text'] }, output: { format: 'markdown' } } })
  expect(saved.versions.find(v => v.number === 1)).toEqual(prior.versions[0])
  expect(usageDecision(saved, 'lin', store().state().campus!.userCenter).allowed).toBe(true)
  run({ type: 'disable', ids: [prior.id], policy: 'pause', note: '暂停使用' })
  expect(usageDecision(getAgent(prior.id), 'lin', store().state().campus!.userCenter).allowed).toBe(false)
  expect(store().state().campus!.runs).toEqual(runs)
  run({ type: 'restore', id: prior.id, note: '恢复使用' })
  expect(usageDecision(getAgent(prior.id), 'lin', store().state().campus!.userCenter).allowed).toBe(true)
})
it('blocks incomplete and duplicate experts and retired model publication without partial writes', () => {
  const before = store().state()
  expect(() => run({ type: 'create', kind: 'expert', config: { ...blankConfig(), name: '会议安排专家' } })).toThrow('已存在')
  expect(store().state()).toEqual(before)
  const id = run({ type: 'create', kind: 'expert', config: { ...blankConfig(), name: '可暂存专家', prompt: '' } })!
  expect(() => run({ type: 'publish', id, note: '配置未完整' })).toThrow('专家简介')
  const config = { ...getAgent(id).draft, description: '聊天简介', prompt: '回答咨询', model: 'campus-retired' }
  run({ type: 'save', id, config, credentialChecked: true })
  const draft = store().state()
  expect(() => run({ type: 'publish', id, note: '离线模型' })).toThrow('可用的模型')
  expect(store().state()).toEqual(draft)
})
it('creates, saves, publishes and disables an expert through the UI and persists after reload', async () => {
  await open('/agents/new/expert')
  expect(screen.queryByLabelText('所属部门')).not.toBeInTheDocument()
  chooseModel()
  fill('专家名称', '学习计划咨询'); fill('专家简介', '提供学习目标拆解和时间安排建议。'); fill('系统提示词', '提供学习咨询建议，信息不足时先追问，不代用户执行操作。'); fill('开场白', '你目前最想解决哪个学习问题？'); fill('推荐问题', '如何安排一周的学习？')
  expect(screen.getByRole('button', { name: '发布专家' })).toBeDisabled()
  click('保存草稿')
  await waitFor(() => expect(store().state().campus!.agents.some(a => a.draft.name === '学习计划咨询')).toBe(true))
  const id = store().state().campus!.agents.find(a => a.draft.name === '学习计划咨询')!.id
  await waitFor(() => expect(screen.getByRole('button', { name: '发布专家' })).toBeEnabled())
  click('发布专家'); fill('发布说明', '首个聊天版本'); click('确认发布')
  await waitFor(() => expect(getAgent(id).live).toBe(1))
  expect(new PrototypeStore(localStorage).state().campus!.agents.find(a => a.id === id)?.live).toBe(1)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  click('停用专家'); fill('操作原因', '测试停用'); click('确认停用')
  await waitFor(() => expect(getAgent(id).disabled).toBe(true))
  expect(usageDecision(getAgent(id), 'lin', store().state().campus!.userCenter).allowed).toBe(false)
  click('发布记录'); await screen.findByRole('heading', { name: '发布记录' }); click('详情')
  expect(screen.getByRole('dialog', { name: '发布版本 v1' })).toHaveTextContent('首个聊天版本')
})
it('retains a draft across remount and lets the user discard when leaving', async () => {
  await open('/agents/new/expert'); fill('专家名称', '未保存专家'); cleanup(); await open('/agents/new/expert')
  expect(screen.getByRole('textbox', { name: '专家名称' })).toHaveValue('未保存专家')
  click('取消'); await screen.findByRole('dialog', { name: '有未保存的修改' }); click('放弃修改并离开')
  await screen.findByRole('heading', { name: '智能体中心' })
  expect(sessionStorage.getItem('chat-expert-draft:new:admin')).toBeNull()
})
it('closes the publish dialog after persistence when reload fails and retries without publishing twice', async () => {
  const id = run({ type: 'create', kind: 'expert', config: { ...blankConfig(), name: '发布重试专家', description: '咨询服务', prompt: '只提供咨询' } })!
  const reload = vi.fn().mockRejectedValueOnce(new Error('read failed')).mockResolvedValue(undefined)
  render(<CampusCenter state={store().state().campus!} route={`/agents/${id}`} navigate={vi.fn()} reload={reload} onDirty={vi.fn()} notify={vi.fn()} />)
  click('发布专家'); fill('发布说明', '验证持久化后重读'); click('确认发布')
  await screen.findByRole('button', { name: '重试读取' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  const revision = store().state().campus!.revision
  click('重试读取'); await waitFor(() => expect(reload).toHaveBeenCalledTimes(2))
  expect(store().state().campus!.revision).toBe(revision); expect(getAgent(id).versions).toHaveLength(1)
})
it('uses the actual expert model catalog in settings and links the overview to merged audits', async () => {
  await open('/settings')
  click('模型管理'); await screen.findByRole('heading', { name: '模型列表' })
  for (const model of models) expect(screen.getByText(model.name, { exact: true })).toBeVisible()
  click('平台设置'); await screen.findByRole('heading', { name: '统一身份认证' })
  expect(screen.queryByRole('button', { name: /测试连接/ })).not.toBeInTheDocument()
  expect(screen.getByText('认证来源（iss）+ 用户标识（sub）')).toBeVisible()
  click('总览'); await screen.findByRole('heading', { name: '让用户找到专家，开始对话' }); click('全部记录')
  await waitFor(() => expect(screen.getByRole('tab', { name: '管理审计' })).toHaveAttribute('aria-selected', 'true'))
})

const skillId = 'capability.local-document.v2'
const mcpId = 'capability.mcp.local-document.v1'
function executionConfig(): Config {
  const config = { ...blankConfig(), name: '资料处理专家', description: '读取资料并输出结构化结果', prompt: '按输入整理资料，使用已配置工具，修改前请用户确认。', model: 'campus-vision', temperature: .6, topP: .7, maxTokens: 8192, streaming: false }
  Object.assign(config, selectCapabilities(config, [skillId, mcpId, 'calendar']))
  config.tools = config.tools.map(b => b.id === skillId ? { ...b, actions: skillActions(b).map(a => ({ ...a, enabled: a.id === 'document.read@local-document/v1' })) } : b.id === mcpId ? { ...b, actions: skillActions(b).map(a => ({ ...a, enabled: a.id === 'document.create@local-document/v1', retry: 0 })) } : b)
  config.nodes = [{ id: 'confirm', name: '创建前确认', trigger: '创建文档之前', approver: '发起人', tool: actionKey(mcpId, 'document.create@local-document/v1') }]
  const io = defaultInteractionConfig(); io.input.modalities = ['text', 'document', 'image']; io.input.fields = [{ ...newInputField([]), label: '主题', key: 'topic' }]
  io.output.format = 'json'; io.output.additionalFormats = ['markdown']; io.output.fields = [{ ...newInputField([]), label: '摘要', key: 'summary' }]; io.output.requirements = '按照约定字段返回 JSON。'
  return { ...config, interaction: io }
}
it('preserves Skill, Tool, MCP operations, parameters and formats through publish and reload', () => {
  const config = executionConfig()
  const id = run({ type: 'create', kind: 'expert', config, publish: true })!
  const before = clone(getAgent(id).versions[0])
  expect(before.config).toMatchObject({ tools: config.tools, nodes: config.nodes, model: config.model, temperature: .6, topP: .7, maxTokens: 8192, streaming: false, interaction: config.interaction })
  const draft = clone(getAgent(id).draft); draft.interaction!.output.format = 'table'; draft.maxTokens = 2048
  run({ type: 'save', id, config: draft, credentialChecked: true, publish: true })
  const restored = new PrototypeStore(localStorage).state().campus!.agents.find(a => a.id === id)!
  expect(restored.live).toBe(2); expect(restored.versions.find(v => v.number === 1)).toEqual(before)
  expect(liveVersion(restored)?.config).toMatchObject({ tools: config.tools, nodes: config.nodes, maxTokens: 2048, interaction: { output: { format: 'table' } } })
})
it.each([
  ['缺少必需工具', (c: Config) => { c.tools.find(b => b.id === skillId)!.actions!.forEach(a => { a.enabled = false }) }, '必需工具'],
  ['未选择 MCP 操作', (c: Config) => { c.tools.find(b => b.id === mcpId)!.actions!.forEach(a => { a.enabled = false }) }, '至少启用一个 MCP 操作'],
  ['缺少执行确认', (c: Config) => { c.nodes = [] }, '前置人工确认'],
  ['未知能力', (c: Config) => { c.tools[0].id = 'unknown' }, '能力已停用或版本不可用'],
  ['不可用 MCP', (c: Config) => { Object.assign(c, selectCapabilities(c, ['capability.mcp.archive.v1'])) }, '能力已停用或版本不可用'],
  ['错误模型输入', (c: Config) => { c.model = 'campus-text' }, '多模态模型'],
  ['未选择输入格式', (c: Config) => { c.interaction!.input.modalities = [] }, '至少选择一种输入格式'],
] as const)('blocks publication of %s without losing the saved draft', (_name, mutate, message) => {
  const config = executionConfig(); mutate(config)
  const id = run({ type: 'create', kind: 'expert', config })!
  const draft = store().state()
  expect(() => run({ type: 'publish', id, note: '校验不完整配置' })).toThrow(message)
  expect(store().state()).toEqual(draft)
})
it('restores model, tool and input/output configuration in the actual administrator workflow', async () => {
  await open('/agents/new/expert'); fill('专家名称', '界面执行配置验收'); fill('专家简介', '配置能力和格式'); fill('系统提示词', '依据资料回答，按约定格式交付。')
  click('模型配置')
  chooseModel('glm-5.2')
  fireEvent.change(screen.getByRole('spinbutton', { name: '最大输出 Token' }), { target: { value: 6144 } })
  click('执行能力'); click('添加能力')
  fill('搜索能力', '本机文档编写'); fireEvent.click(screen.getByRole('checkbox', { name: '本机文档编写' })); click('添加所选（1）')
  fireEvent.click(screen.getByRole('checkbox', { name: '启用 读取本机文档' }))
  click('添加能力'); fill('搜索能力', '校内文档'); fireEvent.click(within(screen.getByRole('dialog', { name: '添加能力' })).getByRole('checkbox', { name: '启用 创建本机文档' })); click('添加所选（1）')
  click('添加能力'); fill('搜索能力', '校内日程'); fireEvent.click(screen.getByRole('checkbox', { name: '校内日程' })); click('添加所选（1）')
  click('输入输出'); fireEvent.click(screen.getByRole('checkbox', { name: '图片' })); fireEvent.click(screen.getByRole('checkbox', { name: 'Markdown' })); fireEvent.click(screen.getByRole('checkbox', { name: '纯文本' }))
  click('保存草稿')
  await waitFor(() => expect(store().state().campus!.agents.some(a => a.draft.name === '界面执行配置验收')).toBe(true))
  const saved = store().state().campus!.agents.find(a => a.draft.name === '界面执行配置验收')!
  expect(saved.draft.tools.map(b => b.id)).toEqual([skillId, mcpId, 'calendar'])
  expect(saved.draft).toMatchObject({ model: 'glm-5.2', maxTokens: 6144, interaction: { input: { modalities: ['text', 'image'] }, output: { format: 'markdown' } } })
  await waitFor(() => expect(screen.getByRole('button', { name: '发布专家' })).toBeEnabled())
  click('发布专家'); fill('发布说明', '包含能力和输入输出'); click('确认发布')
  await waitFor(() => expect(getAgent(saved.id).live).toBe(1))
  click('发布记录'); await screen.findByRole('heading', { name: '发布记录' }); click('详情')
  const dialog = screen.getByRole('dialog', { name: '发布版本 v1' })
  expect(dialog).toHaveTextContent('创建本机文档'); expect(dialog).toHaveTextContent('6144 Token'); expect(dialog).toHaveTextContent('Markdown')
})
it('lets an old pure-chat draft gain capabilities without changing its stored history', () => {
  const io = defaultInteractionConfig(); io.input.attachments.count = 0; io.output.sourceRequired = false
  const config: Config = { ...blankConfig(), mode: 'chat', name: '旧聊天专家', description: '旧配置', prompt: '回答问题', interaction: io }
  const id = run({ type: 'create', kind: 'expert', config, publish: true })!
  const before = clone(getAgent(id).versions[0]); const draft = clone(getAgent(id).draft)
  Object.assign(draft, selectCapabilities(draft, ['calendar']))
  run({ type: 'save', id, config: draft, credentialChecked: true, publish: true })
  expect(getAgent(id).versions.find(v => v.number === 1)).toEqual(before)
  expect(getAgent(id).draft.tools).toHaveLength(1)
})

it('publishes format-only JSON without a schema and omits the removed configuration panels', async () => {
  await open('/agents/new/expert')
  chooseModel()
  fill('专家名称', '格式精简验收'); fill('专家简介', '输出 JSON'); fill('系统提示词', '根据需求返回 JSON。')
  expect(screen.queryByRole('heading', { name: '发布到用户前台' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '聊天入口预览' })).not.toBeInTheDocument()
  click('输入输出')
  expect(screen.getByRole('group', { name: '输入格式' })).toBeVisible()
  expect(screen.getByRole('group', { name: '输出格式' })).toBeVisible()
  expect(screen.queryByRole('button', { name: '添加填写项' })).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: '结果内容要求' })).not.toBeInTheDocument()
  expect(screen.queryByRole('checkbox', { name: '交付前请用户确认' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox', { name: 'JSON' }))
  fireEvent.click(screen.getByRole('checkbox', { name: '纯文本' }))
  click('保存草稿')
  await waitFor(() => expect(screen.getByRole('button', { name: '发布专家' })).toBeEnabled())
  click('发布专家'); fill('发布说明', '仅选择格式即可发布'); click('确认发布')
  await waitFor(() => expect(store().state().campus!.agents.find(a => a.draft.name === '格式精简验收')?.live).toBe(1))
  const saved = new PrototypeStore(localStorage).state().campus!.agents.find(a => a.draft.name === '格式精简验收')!
  expect(liveVersion(saved)?.config.interaction?.output).toMatchObject({ format: 'json', fields: [] })
})
it('keeps historical advanced input/output data when saving format choices without making it a hidden publish requirement', () => {
  const config = executionConfig()
  config.interaction!.input.entryMode = 'form'; config.interaction!.input.fields = []
  config.interaction!.output.fields = []; config.interaction!.output.templateRef = '旧模板'
  config.interaction!.output.sections = [{ id: 'old', title: '' }]
  const original = clone(config.interaction!)
  const id = run({ type: 'create', kind: 'expert', config, publish: true })!
  expect(liveVersion(getAgent(id))?.config.interaction).toEqual(original)
  const old = clone(getAgent(id).versions[0]); const draft = clone(getAgent(id).draft)
  draft.interaction!.input.modalities = ['text']; draft.interaction!.output.format = 'pdf'
  run({ type: 'save', id, config: draft, credentialChecked: true, publish: true })
  expect(getAgent(id).versions.find(v => v.number === 1)).toEqual(old)
  expect(liveVersion(getAgent(id))?.config.interaction?.output).toMatchObject({ format: 'pdf', templateRef: '旧模板', sections: original.output.sections })
})
